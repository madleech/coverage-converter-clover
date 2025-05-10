# Coverage Converter for Clover (JS)

This is a simple GitHub action that takes (one or more) Clover `clover.xml` files and produces a single combined document. This is suitable for converting test coverage results from Jest and other JS testing frameworks that use [Istanbul](https://istanbul.js.org/), as well as Maven and other test frameworks.

## Usage

To use in a Github workflow, run your tests as normal, then add the following step:
```yaml
    - uses: madleech/coverage-converter-clover
```

This will read in `coverage/clover.xml` from RSpec and produce `coverage.json` with the following format:
```json
{
  "test.rb": [null, null, 1, 1, 0, null]
}
```

## Combining Multiple Resultsets

If you're running your test suite in parallel, you'll likely end up with multiple `clover.xml` files which need combining. This action can handle it automatically:

```yaml
    - uses: madleech/coverage-converter-clover
      with:
        coverage-file: "**/clover.xml"
```
