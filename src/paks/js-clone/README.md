js-clone
===

Clone javascript objects and arrays.

    clone(src)

If the src is an array or object, a new array/object is created with identical copied properties.
This routine is not recursive and only works one level deep.

If the src is not an array or object, a reference to the supplied src is returned.

### Options

* param src Source object or array
* returns A cloned object
