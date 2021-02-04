/*
    js-blend - Blend objects
 */

import combine from 'js-combine'

export default function blend(dest, ...src) {
    if (!dest) {
        dest = {}
    }
    for (let obj of src) {
        if (obj) {
            dest = combine(dest, obj)
        }
    }
    return dest
}
