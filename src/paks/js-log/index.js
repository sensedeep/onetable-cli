/*
    log.js - Simple, fast logging

    import Log from 'js-log'

    let log = new Log(options, context)
    child = log.child({module: 'aws'})

    log.setLevels({ddb: 3})
    log.setFilters([
        field: 'source',
        levels: {
            'aws': 5,
            'default': 1
        }
    ])

    info(message, context, operations)
    data(message, context, operations)
    error(message, context, operations)
    info(message, context, operations)
    trace(message, context, operations)
    exception(message, context, operations)

    usage(message, context, operations)

    Operations
        alert       - Create Alert record
        bug         - Create a Bug record
        log         - Set to false to disable logging
        notify      - Notify user via email template
        trail       - Add to account trail

    Operation parameters
        email       - Destination of notification
        expires     - When alert expires
        internal    - Extra internal information never contexted to the user
        message     - If supplied, the original message param becomes params.subject
        priority    - Alert priority
        subject     - Message subject (alert, notice)
        template    - Notification (email) template (implies notify)

    Example Context Fields
        module      - Originating source module
        time        - Time of event
        type        - data|debug|error|info|trace
        req         - Request correlation ID
        sessionId   - Cookie session ID
        accountId   - Account ID
        userId      - User ID
        resourceId  - Resource ID
        credId      - Credential ID
        ip          - Client IP address
        instance    - Instance ID
        hostname    - Public DNS hostname
        code        - Error code string
        details     - Extra information not part of the message
 */

var defaultLog

const DefaultFilters = [{
    field: 'source',
    levels: {
        'default': '1'
    }
}]

const DefaultTypes = {
    "error": 0,
    "exception": 0,
    "info": 1,
    "data": 2,
    "debug": 3,
    "trace": 4
}

export default class Log {
    constructor(options = {}, context = {}) {
        this.context = context
        this.options = options
        this.filters = DefaultFilters
        this.types = DefaultTypes
        this.loggers = []
        defaultLog = this
        if (options.endpoint == 'json') {
            this.addLogger(new JsonLogger(options, context))
        } else {
            this.addLogger(new ConsoleLogger(options, context))
        }
        this.addUncaughtExceptions()
        this.setFilters(options)
    }

    child(context) {
        context = context ? Object.assign({}, this.context, context) : this.context
        let log = new Log(this.options, context)
        log.filters = null
        log.loggers = this.loggers.slice(0)
        log.types = this.types
        log.parent = this
        return log
    }

    get config() {
        return {
            types: this.types,
            filters: this.filters,
            context: this.context,
        }
    }

    addLogger(logger) {
       this.loggers.push(logger)
    }

    setFilters(params) {
        if (params.types) {
            this.types = params.types
        }
        this.filters = params.filters
        if (!this.filters) {
            this.filters = DefaultFilters
        }
        if (!Array.isArray(this.filters)) {
            this.filters = [this.filters]
        }
    }

    setLevels(levels) {
        if (!this.filters) {
            this.filters = Object.clone(DefaultFilters)
        }
        for (let [key,value] of Object.entries(levels)) {
            this.filters[0].levels[key] = value
        }
    }

    addContext(context) {
        this.context = Object.assign(this.context, context)
    }

    data(message, context, ops) {
        this.submit('data', message, context, ops)
    }

    debug(message, context, ops) {
        this.submit('debug', message, context, ops)
    }

    error(message, context, ops) {
        this.submit('error', message, context, ops)
    }

    exception(message, context = {}, ops = {}) {
        // debugger;
        this.submit('exception', message, context, ops)
    }

    info(message, context, ops) {
        this.submit('info', message, context, ops)
    }

    trace(message, context = {}, ops = {}) {
        this.submit('trace', message, context, ops)
    }

    submit(type, message, context = {}, ops = {}) {
        context = Object.assign({}, context)
        if (context.message) {
            context.subject = message
        } else {
            context.message = message
        }
        context.type = type
        context.level = context.level != null ? context.level : (this.types[type] || 0)
        if (context.at === true) {
            try {
                context.at = (new Error('stack')).stack.split('\n')[3].trim().replace(/^.*webpack:\/|:[0-9]*\)$/g, '')
            } catch(err) {}
        }
        this.write({context, ops})
    }

    write(params) {
        this.prep(params)
        for (let logger of this.loggers) {
            logger.write(this, params)
        }
    }

    prep(params) {
        let {context, ops} = params
        let message = context.message

        if (message instanceof Error) {
            context.exception = message

        } else if (context instanceof Error) {
            let exception = context
            context = {exception}

        } else if (context.err instanceof Error) {
            context.exception = context.err
            delete context.err

        } else if (typeof message != 'string') {
            context.message = JSON.stringify(message)
        }
        if (context.exception) {
            let err = context.exception
            let exception = context.exception = Object.assign({}, err)
            if (err.stack) {
                exception.stack = err.stack
            }
            exception.message = err.message
            exception.code = err.code
        }
        if (context.template) {
            ops.notify = true
        }
        context.time = new Date()
        if (Array.isArray(context.message)) {
            context.message = context.message.join(' ')
        }
        params.context = Object.assign({}, this.context, context)
    }

    applyFilters(params) {
        let {context} = params
        let level

        let filters = this.filters
        let superior = this.parent
        while (!filters && superior) {
            filters = superior.filters
            superior = superior.parent
        }
        if (filters) {
            for (let filter of filters) {
                let item = context[filter.field] || 'default'
                level = filter.levels[item]
                if (level == null) {
                    level = filter.levels['default']
                }
                if (level != null) {
                    break
                }
            }
        }
        if (level == null) {
            level = 0
        }
        return (context.level > level) ? false : true
    }

    addUncaughtExceptions() {
        let self = this
        if (typeof window != 'undefined') {
            global.onerror = function(message, module, line, column, err) {
                self.exception(message, err)
            }
            global.onunhandledrejection = (rejection) => {
                let message = `Unhandled promise rejection : ${rejection.message}`
                if (rejection && rejection.reason && rejection.reason.stack) {
                    message += `\r${rejection.reason.stack}`
                }
                self.error(message)
           }
        }
    }

    addNodeExceptions() {
        let self = this
        if (typeof process != 'undefined') {
            process.on("uncaughtException", function(err) {
                self.exception('Uncaught exception', err)
            })
        }
    }
}

class JsonLogger {
    constructor(options, context) {
        this.options = options
        this.context = context
    }

    write(log, params) {
        let {context, ops} = params
        let {message, module, type} = context
        if (ops.log !== false) {
            let result = log.applyFilters(params)
            if (result) {
                try {
                    if (context.type == 'error' || context.type == 'exception') {
                        console.error(JSON.stringify(context) + '\n')
                    } else {
                        console.log(JSON.stringify(context) + '\n')
                    }
                } catch (err) {
                    console.log(JSON.stringify({message, module, type}) + '\n')
                }
            }
        }
    }
}

class ConsoleLogger {
    constructor(options, context) {
        this.options = options
        this.context = context
    }

    write(log, params) {
        let options = this.options
        let {context, ops} = params
        let {message, module, type} = context
        if (ops.log !== false && log.applyFilters(params)) {
            module = module || (options && options.name ? options.name : 'app')
            let time = this.getTime()
            let exception = context.exception
            try {
                if (exception) {
                    console.error(`${time}: ${module}: ${type}: ${message}: ${exception.message}`)
                    console.error(exception.stack)
                    console.error(JSON.stringify(context, null, 4) + '\n')

                } else if (context.type == 'error') {
                    console.error(`${time}: ${module}: ${type}: ${message}`)
                    console.error(JSON.stringify(context, null, 4) + '\n')

                } else if (context.type == 'trace') {
                    console.log(`${time}: ${module}: ${type}: ${message}`)
                    console.log(JSON.stringify(context, null, 4) + '\n')

                } else {
                    console.log(`${time}: ${module}: ${type}: ${message}`)
                    console.log(JSON.stringify(context, null, 4) + '\n')
                }
            } catch (err) {
                console.log(`Exception in emitting log message: ${message}`)
            }
        }
    }

    getTime() {
        let now = new Date()
        return `${this.zpad(now.getHours(), 2)}:${this.zpad(now.getMinutes(), 2)}:${this.zpad(now.getSeconds(), 2)}`
    }

    zpad(n, size) {
        let s = n + ''
        while (s.length < size) s = '0' + s
        return s
    }
}
