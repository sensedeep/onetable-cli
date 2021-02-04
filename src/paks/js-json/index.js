/*
    js-json - Json Encoding
 */

export default class Json {

    /*
        Reviver for JSON.parse(, reviver)
     */
    static decode(key, value) {
        if (typeof value == 'string') {
            if (value.indexOf('{type:date}') == 0) {
                return new Date(value.slice(11))
            } else if (value.indexOf('{type:regexp}') == 0) {
                return new Regexp(value.slice(13))
            }
        }
        return value
    }

    /*
        Prepare an object for encoding by JSON.stringify()
     */
    static encode(obj, nest = 0) {
        let result
        if (obj) {
            result = Array.isArray(obj) ? [] : {}
            for (let [key,value] of Object.entries(obj)) {
                if (value instanceof Date) {
                    result[key] = '{type:date}' + value.toUTCString()

                } else if (value instanceof RegExp) {
                    result[key] = '{type:regexp}' + value.source

                } else if (typeof value == 'object') {
                    if (nest < 20) {
                        result[key] = Json.encode(value, nest + 1)
                    } else {
                        result[key] = value
                    }
                } else {
                    result[key] = value
                }
            }
        } else {
            result = obj
        }
        return result
    }
}
