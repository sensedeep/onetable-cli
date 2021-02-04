js-blend
===

Blend the contents of one javascript object into another by copying the properites of one object into another.

    blend(dest, src, combine)

If the "combine" option is true, then property prefixes: +, =, - and ? are used as modifiers describing
how to combine source and destination property values.

### Options

* param dest Destination object
* param src Source object
* combine Boolean. If true, then support key prefixes "+", "=", "-", "?" to add, assign and subtract
    and conditionally assign key values. When adding string properties, values will be appended using a
    space separator. Extra spaces will not be removed on subtraction.
    Arrays with string values may also be combined using these key prefixes.
    Defaults to false.
* returns The destination object
