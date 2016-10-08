const path = require('path');
const test = require('ava').test;
const rewire = require('rewire');

const testHome = '/home/test/nvs/'.replace(/\//g, path.sep);
global.settings = {
    home: testHome,
    aliases: {},
    remotes: {
        'test1': 'http://example.com/test1',
        'test2': 'http://example.com/test2',
    },
    quiet: true,
};

const linkPath = testHome + 'current';

const mockFs = require('./mockFs');
const mockChildProc = require('./mockChildProc');
const mockHttp = require('./mockHttp');

const nvsVersion = require('../lib/version');
const nvsEnv = rewire('../lib/env');
const nvsInstall = rewire('../lib/install');

nvsEnv.__set__('fs', mockFs);
nvsInstall.__set__('nvsEnv', nvsEnv);
nvsInstall.__set__('fs', mockFs);
nvsInstall.__set__('childProcess', mockChildProc);
nvsInstall.__set__('http', mockHttp);
nvsInstall.__set__('https', mockHttp);

const bin = (nvsEnv.isWindows ? '' : 'bin');
const exe = (nvsEnv.isWindows ? 'node.exe' : 'node');

function mockFile(filePath) {
    mockFs.statMap[filePath.replace(/\//g, path.sep)] = {
        isDirectory() { return false; }
    };
}

function mockDir(dirPath, childNames) {
    mockFs.statMap[dirPath.replace(/\//g, path.sep)] = {
        isDirectory() { return true; }
    };
    mockFs.dirMap[dirPath.replace(/\//g, path.sep)] = childNames;
}

function setPath(pathEntries) {
    process.env['PATH'] = pathEntries
        .join(nvsEnv.pathSeparator).replace(/\//g, path.sep);
}

test.beforeEach(t => {
    mockFs.reset();
    mockChildProc.reset();
    mockHttp.reset();

    mockDir(testHome, ['test1', 'test2']);
    mockDir(path.join(testHome, 'test1'), ['5.6.7']);
    mockDir(path.join(testHome, 'test1', '5.6.7'), ['x86', 'x64']);
    mockDir(path.join(testHome, 'test1', '5.6.7', 'x86'), []);
    mockDir(path.join(testHome, 'test1', '5.6.7', 'x64'), []);
    mockDir(path.join(testHome, 'test2'), ['6.7.8']);
    mockDir(path.join(testHome, 'test2', '6.7.8'), ['x64']);
    mockDir(path.join(testHome, 'test2', '6.7.8', 'x64'), []);
    mockFile(path.join(testHome, 'test1', '5.6.7', 'x86', bin, exe));
    mockFile(path.join(testHome, 'test1', '5.6.7', 'x64', bin, exe));
    mockFile(path.join(testHome, 'test2', '6.7.8', 'x64', bin, exe));
    mockHttp.resourceMap['http://example.com/test1/v7.8.9/node-v7.8.9-win-x64.zip'] = 'test';
    mockHttp.resourceMap['http://example.com/test1/v7.8.9/node-v7.8.9-' +
        process.platform + '-x86.tar.gz'] = 'test';
});

test('List installed - all', t => {
    let result = nvsInstall.list();
    t.truthy(result);
    let resultLines = result.trim().split('\n').map(line => line.trim());
    t.is(resultLines.length, 3);
    t.true(resultLines.indexOf('test1/5.6.7/x86') >= 0);
    t.true(resultLines.indexOf('test1/5.6.7/x64') >= 0);
    t.true(resultLines.indexOf('test2/6.7.8/x64') >= 0);
});

test('List installed - filter', t => {
    let result = nvsInstall.list('test2');
    t.truthy(result);
    let resultLines = result.trim().split('\n').map(line => line.trim());
    t.is(resultLines.length, 1);
    t.is(resultLines[0], 'test2/6.7.8/x64');
});

test('List installed - marks', t => {
    setPath([
        testHome + 'test1/5.6.7/x64' + bin + '/',
        '/bin',
    ]);
    mockFs.statMap[linkPath] = {};
    if (nvsEnv.isWindows) {
        mockFs.linkMap[linkPath] =
            path.join(testHome, 'test2\\6.7.8\\x64');
    } else {
        mockFs.linkMap[linkPath] = 'test2/6.7.8/x64';
    }

    let result = nvsInstall.list();
    t.truthy(result);
    let resultLines = result.trim().split('\n').map(line => line.trim());
    t.is(resultLines.length, 3);
    t.true(resultLines.indexOf('test1/5.6.7/x86') >= 0);
    t.true(resultLines.indexOf('>test1/5.6.7/x64') >= 0);
    t.true(resultLines.indexOf('#test2/6.7.8/x64') >= 0);
});

test('Install - download binary', t => {
    let version = nvsVersion.parse('test1/7.8.9/x64');

    mockChildProc.mockActions.push({ cb: () => {
        mockDir(path.join(testHome, 'test1', '7.8.9', 'x64', 'node-v7.8.9-win-x64'), [exe]);
        mockFile(path.join(testHome, 'test1', '7.8.9', 'x64', 'node-v7.8.9-win-x64', exe));
    }});

    return nvsInstall.installAsync(version).then(message => {
        t.regex(message, /^Installed at/);
        t.truthy(nvsEnv.getVersionBinary(version));
    });
});

test('Install - not found', t => {
    let version = nvsVersion.parse('test1/9.9.9/x86');

    return nvsInstall.installAsync(version).then(() => {
        throw new Error('Download should have failed!');
    }, e => {
        t.regex(e.message, /404/);
        t.falsy(mockFs.dirMap[path.join(testHome, 'test1', '9.9.9')]);
    });
});

test('Install - already installed', t => {
    let version = nvsVersion.parse('test1/5.6.7/x64');

    return nvsInstall.installAsync(version).then(message => {
        t.regex(message, /Already installed at/);
    });
});

test.todo('Uninstall');
test.todo('Uninstall - not installed');
