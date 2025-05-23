const core = require('@actions/core');
const fs = require('fs');
const glob = require('glob');
const xpath = require('xpath');
const DOMParser = require('@xmldom/xmldom').DOMParser;

function run() {
  try {
    const pattern = core.getInput("coverage-file");
    core.info(`Coverage file pattern: ${pattern}`);

    const files = expand(pattern);
    core.info(`Coverage files: ${files.join(", ")}`);

    const inputs = read(files);
    const nodes = findFileNodes(inputs);
    const converted = convertFormat(nodes);
    core.debug(`Converted coverage: ${JSON.stringify(converted)}`);

    const merged = merge(converted);
    core.debug(`Merged coverage: ${JSON.stringify(merged)}`);

    let prefix = core.getInput('remove-prefix');
    if (prefix == 'github_workspace') {
      prefix = process.env.GITHUB_WORKSPACE;
    }
    // GH uses relative paths in its diffs
    if (!prefix.endsWith('/')) {
      prefix += '/';
    }
    const output = removePrefixes(merged, prefix);
    core.debug(`With prefixes removed: ${JSON.stringify(output)}`);

    const path = write(output);
    core.info(`Wrote merged coverage to ${path}`);

    // Set the output for the action
    core.setOutput('coverage-file', path);
  } catch (error) {
    console.error(error); // eslint-disable-line no-console

    core.setFailed(error.message);
  }
}

// resolve coverage file paths
function expand(pattern) {
  const files = glob.sync(pattern);
  if (files.length === 0) {
    throw new Error(`No coverage files found matching pattern: ${pattern}`);
  }
  return files
}

// load coverage files
function read(files) {
  return files.map((file) => {
    const xmlContent = fs.readFileSync(file, 'utf8');
    const parser = new DOMParser();
    return parser.parseFromString(xmlContent, 'text/xml');
  });
}

// find <file> nodes in the clover xml
function findFileNodes(inputs) {
  const files = [];
  for (const input of inputs) {
    const fileNodes = xpath.select('//file', input);
    fileNodes.forEach(file => files.push(file));
  }
  return files;
}

// convert from nodes of <file name path><line num count></file> to {<file>: [lines]}
// note that ignored lines are not included in clover, so we add them in as nulls
function convertFormat(input) {
  const output = [];
  for (const file of input) {
    const fileName = file.getAttribute('path');
    // lines we have coverage for
    const lines = {};
    let lastLine = 0;
    for (const line of xpath.select('line', file)) {
      const num = parseInt(line.getAttribute('num'));
      const count = parseInt(line.getAttribute('count'));
      if (num > lastLine) lastLine = num;
      lines[num] = count;
    }
    const lineCounts = [];
    for (let i = 1; i <= lastLine; i++) {
      lineCounts.push(lines[i] === undefined ? null : lines[i]);
    }
    output.push({[fileName]: lineCounts});
  }
  return output;
}

// each input is an array of suite runs
function merge(inputs) {
  let combinedCoverage = {};
  for (let i=0; i<inputs.length; i++) {
    const one = combinedCoverage;
    const two = inputs[i];
    const fileNames1 = Object.keys(one);
    const fileNames2 = Object.keys(two);
    const fileNames = [...new Set(fileNames1.concat(fileNames2))];

    for (let fileName of fileNames) {
      combinedCoverage[fileName] = combine(
        one[fileName] || [],
        two[fileName] || []
      )
    }
  }
  return combinedCoverage;
}

function combine(one, two) {
  const zipped = [];
  for (let i=0; i<Math.max(one.length, two.length); i++) {
    zipped[i] = [one[i], two[i]];
  }
  return zipped.map(([a, b]) => sum(a, b));
}

// see https://github.com/simplecov-ruby/simplecov/blob/main/lib/simplecov/combine/lines_combiner.rb#L32 for logic
function sum(a, b) {
  const sum = (a || 0) + (b || 0);
  if (sum == 0 && (a === null || b === null)) return null;
  return sum;
}

// remove common prefix from file patht to convert absolute paths to relative paths
function removePrefixes(input, prefix) {
  if (prefix == "") return input;

  const result = {};
  for (const [filename, coverage] of Object.entries(input)) {
    let newFilename = filename;
    if (prefix && filename.startsWith(prefix)) {
      newFilename = filename.slice(prefix.length);
    }
    result[newFilename] = coverage;
  }
  return result;
}

// Write the combined coverage data to a file
function write(output) {
  const path = 'coverage.json';
  fs.writeFileSync(path, JSON.stringify(output, null, 2));

  return path;
}

module.exports = {run, expand, read, findFileNodes, convertFormat, combine, sum, merge, removePrefixes, write}
