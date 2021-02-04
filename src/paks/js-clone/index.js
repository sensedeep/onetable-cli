/*
    js-clone - Clone objects recursively
 */

const RECURSE_LIMIT = 50

export default function clone(src, recurse = 0) {
    let result

    if (recurse > RECURSE_LIMIT) {
        throw new Error('Recursive clone')
    }
    if (Array.isArray(src)) {
        result = []
        for (let item of src) {
            result.push(clone(item, recurse + 1))
        }
    } else if (typeof src == 'object' && !(src instanceof Date || src instanceof RegExp || src == null)) {
        result = Object.create(Object.getPrototypeOf(src))
        var i, descriptor, keys = Object.getOwnPropertyNames(src)
        for (i = 0; i < keys.length; i ++) {
            descriptor = Object.getOwnPropertyDescriptor(src, keys[i])
            if (descriptor.get) {
                let value = descriptor.get()
                if (value === undefined) continue
                if (value && typeof value === 'object') {
                    value = clone(value, recurse + 1)
                }
                descriptor = {
                    value,
                    configurable: descriptor.configurable,
                    enumerable: descriptor.enumerable,
                    writable: true,
                }
            } else if (descriptor.value && typeof descriptor.value === 'object') {
                if (keys[i] == '__observers__' || keys[i] == '__ob__') {
                    continue
                }
                descriptor.value = clone(descriptor.value, recurse + 1)
            }
            Object.defineProperty(result, keys[i], descriptor)
        }
    } else {
        result = src
    }
    return result
}
