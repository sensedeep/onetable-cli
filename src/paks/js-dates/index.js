/*
    js-dates -- Node date formatting
 */

var token = /d{1,4}|m{1,4}|yy(?:yy)?|([HhMsTt])\1?|[LloSZ]|"[^"]*"|'[^']*'/g
var timezone = /\b(?:[PMCEA][SDP]T|(?:Pacific|Mountain|Central|Eastern|Atlantic) (?:Standard|Daylight|Prevailing) Time|(?:GMT|UTC)(?:[-+]\d{4})?)\b/g
var timezoneClip = /[^-+\dA-Z]/g

var pad = function (val, len) {
     val = String(val)
     len = len || 2
     while (val.length < len) {
         val = "0" + val
     }
     return val
}

var formats = {
     "default":      "ddd mmm dd yyyy HH:MM:ss",
     shortDate:      "m/d/yy",
     mediumDate:     "mmm d, yyyy",
     longDate:       "mmmm d, yyyy",
     fullDate:       "dddd, mmmm d, yyyy",
     shortTime:      "h:MM TT",
     mediumTime:     "h:MM:ss TT",
     longTime:       "h:MM:ss TT Z",
     isoDate:        "yyyy-mm-dd",
     isoTime:        "HH:MM:ss",
     isoDateTime:    "yyyy-mm-dd'T'HH:MM:ss",
     isoUtcDateTime: "UTC:yyyy-mm-dd'T'HH:MM:ss'Z'",
     syslog:         "UTC:mmm d HH:MM:ss"
}

var names = {
    dayNames: [
        "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
        "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
    ],
    shortMonthNames: [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ],
    monthNames: [
        "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"
    ]
}

Date.prototype.format = function (fmt, when) {
    let d = new Dates
    return d.format(this, fmt, when)
}

export default class Dates {
    static format(date, fmt, utc) {
        date = date || new Date()
        let original = date
        // You can't provide utc if you skip other args (use the "UTC:" fmt prefix)
        if (arguments.length == 1 && Object.prototype.toString.call(date) == "[object String]" && !/\d/.test(date)) {
            fmt = date
            date = undefined
        }
        date = date ? new Date(date) : new Date
        if (isNaN(date)) {
            //throw SyntaxError("invalid date")
            return original
        }
        fmt = String(formats[fmt] || fmt || formats["default"])

        // Allow setting the utc argument via the fmt
        if (fmt.slice(0, 4) == "UTC:") {
            fmt = fmt.slice(4)
            utc = true
        }
        if (utc == undefined) {
            utc = false
        }
        var _ = utc ? "getUTC" : "get",
            d = date[_ + "Date"](),
            D = date[_ + "Day"](),
            m = date[_ + "Month"](),
            y = date[_ + "FullYear"](),
            H = date[_ + "Hours"](),
            M = date[_ + "Minutes"](),
            s = date[_ + "Seconds"](),
            L = date[_ + "Milliseconds"](),
            o = utc ? 0 : date.getTimezoneOffset(),
            flags = {
                d:    d,
                dd:   pad(d),
                ddd:  names.dayNames[D],
                dddd: names.dayNames[D + 7],
                m:    m + 1,
                mm:   pad(m + 1),
                mmm:  names.shortMonthNames[m],
                mmmm: names.monthNames[m],
                yy:   String(y).slice(2),
                yyyy: y,
                h:    H % 12 || 12,
                hh:   pad(H % 12 || 12),
                H:    H,
                HH:   pad(H),
                M:    M,
                MM:   pad(M),
                s:    s,
                ss:   pad(s),
                l:    pad(L, 3),
                L:    pad(L > 99 ? Math.round(L / 10) : L),
                t:    H < 12 ? "a"  : "p",
                tt:   H < 12 ? "am" : "pm",
                T:    H < 12 ? "A"  : "P",
                TT:   H < 12 ? "AM" : "PM",
                Z:    utc ? "UTC" : (String(date).match(timezone) || [""]).pop().replace(timezoneClip, ""),
                o:    (o > 0 ? "-" : "+") + pad(Math.floor(Math.abs(o) / 60) * 100 + Math.abs(o) % 60, 4),
                S:    ["th", "st", "nd", "rd"][d % 10 > 3 ? 0 : (d % 100 - d % 10 != 10) * d % 10]
            }
        return fmt.replace(token, function ($0) {
            return $0 in flags ? flags[$0] : $0.slice(1, $0.length - 1)
        })
    }
}

Dates.names = names
Dates.formats = formats
