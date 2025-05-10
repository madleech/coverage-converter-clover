const fs = require('fs');
const glob = require('glob');
const core = require('@actions/core');
const logic = require('../logic');
const DOMParser = require('@xmldom/xmldom').DOMParser;

// Mock the core module
jest.mock('@actions/core', () => ({
  getInput: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  setOutput: jest.fn(),
  setFailed: jest.fn()
}));

// Mock the fs module
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn()
}));

// Mock the glob module
jest.mock('glob', () => ({
  sync: jest.fn()
}));

describe('clover-converter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('expand', () => {
    it('should return matching files', () => {
      const mockFiles = ['1/clover.xml', '2/clover.xml'];
      glob.sync.mockReturnValue(mockFiles);

      const result = logic.expand('**/clover.xml');
      expect(result).toEqual(mockFiles);
      expect(glob.sync).toHaveBeenCalledWith('**/clover.xml');
    });

    it('should throw error when no files found', () => {
      glob.sync.mockReturnValue([]);
      expect(() => logic.expand('**/clover.xml')).toThrow('No coverage files found matching pattern: **/clover.xml');
    });
  });

  describe('read', () => {
    it('should read and parse XML files', () => {
      const mockFiles = ['1/clover.xml', '2/clover.xml'];
      const mockContents = [
        '<?xml version="1.0" encoding="UTF-8"?><coverage><file name="errors.ts" path="$PROJECT_PATH/src/errors.ts"><line num="1" count="1" type="stmt"/><line num="4" count="3" type="stmt"/></file></coverage>',
        '<?xml version="1.0" encoding="UTF-8"?><coverage><file name="test.ts" path="$PROJECT_PATH/src/test.ts"><line num="1" count="1" type="stmt"/><line num="3" count="1" type="stmt"/><line num="4" count="1" type="stmt"/><line num="6" count="1" type="stmt"/><line num="7" count="1" type="stmt"/><line num="9" count="1" type="stmt"/><line num="10" count="1" type="stmt"/><line num="12" count="1" type="stmt"/><line num="13" count="1" type="stmt"/></file></coverage>'
      ];

      fs.readFileSync
        .mockReturnValueOnce(mockContents[0])
        .mockReturnValueOnce(mockContents[1]);

      const result = logic.read(mockFiles);
      const parser = new DOMParser();
      const expected = [
        parser.parseFromString(mockContents[0], 'text/xml'),
        parser.parseFromString(mockContents[1], 'text/xml')
      ];
      expect(result).toEqual(expected);
      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('findFileNodes', () => {
    it('finds file nodes', () => {
      const parser = new DOMParser();
      const input = [
        parser.parseFromString(
          `<?xml version="1.0" encoding="UTF-8"?><coverage>
          <file name="errors.ts" path="$PROJECT_PATH/src/errors.ts"><line num="1" count="1" type="stmt"/><line num="4" count="3" type="stmt"/></file>
          <file name="test.ts" path="$PROJECT_PATH/src/test.ts"><line num="1" count="1" type="stmt"/><line num="3" count="1" type="stmt"/><line num="4" count="1" type="stmt"/><line num="6" count="1" type="stmt"/><line num="7" count="1" type="stmt"/><line num="9" count="1" type="stmt"/><line num="10" count="1" type="stmt"/><line num="12" count="1" type="stmt"/><line num="13" count="1" type="stmt"/></file>
          </coverage>`,
          'text/xml'
        )
      ];
      const expected = [
        '<file name="errors.ts" path="$PROJECT_PATH/src/errors.ts"><line num="1" count="1" type="stmt"/><line num="4" count="3" type="stmt"/></file>',
        '<file name="test.ts" path="$PROJECT_PATH/src/test.ts"><line num="1" count="1" type="stmt"/><line num="3" count="1" type="stmt"/><line num="4" count="1" type="stmt"/><line num="6" count="1" type="stmt"/><line num="7" count="1" type="stmt"/><line num="9" count="1" type="stmt"/><line num="10" count="1" type="stmt"/><line num="12" count="1" type="stmt"/><line num="13" count="1" type="stmt"/></file>'
      ];
      const result = logic.findFileNodes(input).map(node => node.toString());
      expect(result).toEqual(expected);
    })
  })

  describe('convertFormat', () => {
    it('converts format', () => {
      const parser = new DOMParser();
      const input = [
        parser.parseFromString(
          '<?xml version="1.0" encoding="UTF-8"?><file name="errors.ts" path="$PROJECT_PATH/src/errors.ts"><line num="1" count="1" type="stmt"/><line num="4" count="3" type="stmt"/></file>',
          'text/xml'
        ).documentElement,
        parser.parseFromString(
          '<?xml version="1.0" encoding="UTF-8"?><file name="test.ts" path="$PROJECT_PATH/src/test.ts"><line num="1" count="1" type="stmt"/><line num="3" count="1" type="stmt"/><line num="4" count="1" type="stmt"/><line num="6" count="1" type="stmt"/><line num="7" count="1" type="stmt"/><line num="9" count="1" type="stmt"/><line num="10" count="1" type="stmt"/><line num="12" count="1" type="stmt"/><line num="13" count="1" type="stmt"/></file>',
          'text/xml'
        ).documentElement
      ];
      const expected = [
        {'$PROJECT_PATH/src/errors.ts': [1, null, null, 3]},
        {'$PROJECT_PATH/src/test.ts': [1, null, 1, 1, null, 1, 1, null, 1, 1, null, 1, 1]}
      ];
      const result = logic.convertFormat(input);
      expect(result).toEqual(expected);
    })
  })

  describe('combine', () => {
    it('combines two test runs', () => {
      const one = [1, 1, 1];
      const two = [null, 1, 2];
      const expected = [1, 2, 3];
      const result = logic.combine(one, two);
      expect(result).toEqual(expected);
    })
  })

  describe('sum', () => {
    it('sums the same way as SimpleCov', () => {
      expect(logic.sum(null, null)).toEqual(null);
      expect(logic.sum(null, 0)).toEqual(null);
      expect(logic.sum(0, null)).toEqual(null);
      expect(logic.sum(0, 0)).toEqual(0);
      expect(logic.sum(null, 1)).toEqual(1);
      expect(logic.sum(1, null)).toEqual(1);
      expect(logic.sum(1, 0)).toEqual(1);
      expect(logic.sum(0, 1)).toEqual(1);
      expect(logic.sum(1, 1)).toEqual(2);
      expect(logic.sum(1, 2)).toEqual(3);
    })
  })

  describe('merge', () => {
    it('handles single file', () => {
      const inputs = [
        {'file1.rb': [1, 1, 0]},
      ];

      const expected = {'file1.rb': [1, 1, 0]};

      const result = logic.merge(inputs);
      expect(result).toEqual(expected);
    });

    it('should merge coverage data from multiple files', () => {
      const inputs = [
        {'file1.rb': [1, 1, 0]},
        {'file2.rb': [1, 0, 1]},
      ];

      const expected = {
        'file1.rb': [1, 1, 0],
        'file2.rb': [1, 0, 1],
      };

      const result = logic.merge(inputs);
      expect(result).toEqual(expected);
    });

    it('should merge coverage data from multiple files and runs', () => {
      const inputs = [
        {'file1.rb': [1, 1, 0]},
        {'file2.rb': [1, 0, 1]},
        {
          'file1.rb': [1, 1, 1],
          'file3.rb': [1, 1, 0]
        }
      ];

      const expected = {
        'file1.rb': [2, 2, 1],
        'file2.rb': [1, 0, 1],
        'file3.rb': [1, 1, 0]
      };

      const result = logic.merge(inputs);
      expect(result).toEqual(expected);
    });

    it('behaves identically to SimpleCov when combining', () => {
      const inputs = [
        {'file1.rb': [null,null,1,null,1,1,1,1,null,1,1,1,null,1,null,1,null,1,0,0,null,null,null,null,1,0,null,null,0,null,0,null,0,null,null,0,null,null,1,0,0,0,null,null,null,null,null]},
        {'file1.rb': [null,null,1,null,1,1,1,1,null,1,10,1,null,1,null,1,null,1,30,30,null,null,null,null,1,18,null,null,18,null,9,null,9,null,null,18,null,null,1,0,0,0,null,null,null,null,null]}
      ];

      const expected = {'file1.rb': [null,null,2,null,2,2,2,2,null,2,11,2,null,2,null,2,null,2,30,30,null,null,null,null,2,18,null,null,18,null,9,null,9,null,null,18,null,null,2,0,0,0,null,null,null,null,null]};

      const result = logic.merge(inputs);
      expect(result).toEqual(expected);
    })
  });

  describe('removePrefixes', () => {
    it('should remove common prefix from filenames', () => {
      const input = {
        '/foo/bar.js': [1, 2, 3],
        '/foo/foo/asdf.js': [2, 3, 4]
      };

      const expected = {
        '/bar.js': [1, 2, 3],
        '/foo/asdf.js': [2, 3, 4]
      }

      const result = logic.removePrefixes(input, '/foo');
      expect(result).toEqual(expected);
    });

    it('should no change input when prefix is not provided', () => {
      const input = {
        '/foo/bar.js': [1, 2, 3],
        '/foo/foo/asdf.js': [2, 3, 4]
      };

      const expected = input;

      const result = logic.removePrefixes(input, '');
      expect(result).toEqual(expected);
    })
  });

  describe('run', () => {
    it('should process coverage files successfully', () => {
      const mockPattern = '**/clover.xml';
      const mockFiles = ['coverage/clover.xml'];
      const mockContent = `<?xml version="1.0" encoding="UTF-8"?>
      <coverage generated="1500242170615" clover="3.2.0">
        <project timestamp="1500242170615" name="All files">
          <metrics statements="161" coveredstatements="161" conditionals="24" coveredconditionals="18" methods="49" coveredmethods="49" elements="234" coveredelements="228" complexity="0" loc="161" ncloc="161" packages="9" files="15" classes="15">
            <package name="src">
              <metrics statements="11" coveredstatements="11" conditionals="0" coveredconditionals="0" methods="4" coveredmethods="4"/>
              <file name="errors.ts" path="$PROJECT_PATH/src/errors.ts">
                <metrics statements="2" coveredstatements="2" conditionals="0" coveredconditionals="0" methods="0" coveredmethods="0"/>
                <line num="1" count="1" type="stmt"/>
                <line num="4" count="3" type="stmt"/>
              </file>
              <file name="test.ts" path="$PROJECT_PATH/src/test.ts">
                <metrics statements="9" coveredstatements="9" conditionals="0" coveredconditionals="0" methods="4" coveredmethods="4"/>
                <line num="1" count="1" type="stmt"/>
                <line num="3" count="1" type="stmt"/>
                <line num="4" count="1" type="stmt"/>
                <line num="6" count="1" type="stmt"/>
                <line num="7" count="1" type="stmt"/>
                <line num="9" count="1" type="stmt"/>
                <line num="10" count="1" type="stmt"/>
                <line num="12" count="1" type="stmt"/>
                <line num="13" count="1" type="stmt"/>
              </file>
            </package>
          </metrics>
        </project>
      </coverage>`
      const expected = {
        'src/errors.ts': [1, null, null, 3],
        'src/test.ts': [1, null, 1, 1, null, 1, 1, null, 1, 1, null, 1, 1]
      }

      // mock core.getInput("coverage-file") call
      core.getInput.mockReturnValueOnce(mockPattern);
      // mock core.getInput("remove-prefix") call
      core.getInput.mockReturnValueOnce('$PROJECT_PATH');
      glob.sync.mockReturnValue(mockFiles);
      fs.readFileSync.mockReturnValue(mockContent);

      logic.run();

      expect(core.getInput).toHaveBeenCalledWith('coverage-file');
      expect(core.getInput).toHaveBeenCalledWith('remove-prefix');
      expect(glob.sync).toHaveBeenCalledWith(mockPattern);
      expect(fs.readFileSync).toHaveBeenCalledWith(mockFiles[0], 'utf8');
      expect(core.setOutput).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledWith('coverage.json', JSON.stringify(expected, null, 2));
    });

    it('strips github_workspace', () => {
      const mockPattern = '**/clover.xml';
      const mockFiles = ['coverage/clover.xml'];
      const mockContent = `<?xml version="1.0" encoding="UTF-8"?>
      <coverage generated="1500242170615" clover="3.2.0">
        <project timestamp="1500242170615" name="All files">
          <metrics statements="161" coveredstatements="161" conditionals="24" coveredconditionals="18" methods="49" coveredmethods="49" elements="234" coveredelements="228" complexity="0" loc="161" ncloc="161" packages="9" files="15" classes="15">
            <package name="src">
              <metrics statements="11" coveredstatements="11" conditionals="0" coveredconditionals="0" methods="4" coveredmethods="4"/>
              <file name="errors.ts" path="/github/workspace/src/errors.ts">
                <metrics statements="2" coveredstatements="2" conditionals="0" coveredconditionals="0" methods="0" coveredmethods="0"/>
                <line num="1" count="1" type="stmt"/>
                <line num="4" count="3" type="stmt"/>
              </file>
            </package>
          </metrics>
        </project>
      </coverage>`
      const expected = {
        'src/errors.ts': [1, null, null, 3],
      }

      // mock core.getInput("coverage-file") call
      core.getInput.mockReturnValueOnce(mockPattern);
      core.getInput.mockReturnValueOnce('github_workspace');
      process.env.GITHUB_WORKSPACE = '/github/workspace';
      glob.sync.mockReturnValue(mockFiles);
      fs.readFileSync.mockReturnValue(mockContent);

      logic.run();

      expect(fs.writeFileSync).toHaveBeenCalledWith('coverage.json', JSON.stringify(expected, null, 2));

      process.env.GITHUB_WORKSPACE = undefined;
    })

    it('should handle errors', () => {
      const error = new Error('Test error');
      core.getInput.mockImplementation(() => { throw error; });

      logic.run();

      expect(core.setFailed).toHaveBeenCalledWith(error.message);
    });
  });
});
