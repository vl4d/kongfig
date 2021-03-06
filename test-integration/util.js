import adminApi from '../lib/adminApi';
import readKongApi from '../lib/readKongApi';
import execute from '../lib/core';
import { logReducer } from '../lib/kongStateLocal';
import invariant from 'invariant';
import pad from 'pad';
import { pretty } from '../lib/prettyConfig';

invariant(process.env.TEST_INTEGRATION_KONG_HOST, `
    Please set ${'TEST_INTEGRATION_KONG_HOST'.bold} env variable

    TEST_INTEGRATION_KONG_HOST=localhost:8001 yarn test

    ${'WARNING! Running integration tests are going to remove all data from the kong'.red.bold}.
`);

const UUIDRegex = /[a-f0-9]{8}-?[a-f0-9]{4}-?4[a-f0-9]{3}-?[89ab][a-f0-9]{3}-?[a-f0-9]{12}/g;
let uuids = {};
let log = [];
let rawLog = [];

export const exportToYaml = pretty('yaml');
export const getLocalState = () => rawLog.reduce(logReducer, undefined);

export const testAdminApi = adminApi({
    host: process.env.TEST_INTEGRATION_KONG_HOST,
    https: false,
    ignoreConsumers: false,
    cache: false,
});

export const getLog = () => log;
export const logger = message => {
    if (message.type === 'experimental-features') {
        // cannot include these in tests because they change based on test matrix
        return;
    }

    const m = cloneObject(message);

    if (m.hasOwnProperty('uri')) {
        m.uri = m.uri.replace(process.env.TEST_INTEGRATION_KONG_HOST, 'localhost:8001');
    }

    rawLog.push(m);
    log.push(ignoreKeys(m, ['created_at', 'version']));
};

const _ignoreKeys = (obj, keys) => {
    if (obj instanceof Array) {
        obj.forEach((item) => _ignoreKeys(item, keys));
    } else if (typeof obj === 'object') {
        Object.getOwnPropertyNames(obj).forEach(key => {
            if (typeof obj[key] === 'string' && obj[key].match(UUIDRegex)) {
                obj[key].match(UUIDRegex).forEach(uuid => {
                    if (!uuids.hasOwnProperty(uuid)) {
                        const id = pad(12, `${Object.keys(uuids).length + 1}`, '0');
                        uuids[uuid] = `2b47ba9b-761a-492d-9a0c-${id}`;
                    }

                    obj[key] = obj[key].replace(uuid, uuids[uuid]);
                });
            } else if (keys.indexOf(key) !== -1) {
                obj[key] = `___${key}___`;
            } else {
                _ignoreKeys(obj[key], keys);
            }
        });
    }

    return obj;
};

const cloneObject = obj => JSON.parse(JSON.stringify(obj));

export const ignoreKeys = (message, keys) => _ignoreKeys(cloneObject(message), keys);

const cleanupKong = async () => {
    const results = await readKongApi(testAdminApi);
    await execute({
        apis: results.apis.map(api => ({ ...api, ensure: 'removed' })),
        consumers: results.consumers.map(consumer => ({ ...consumer, ensure: 'removed' })),
        plugins: results.plugins.map(plugin => ({ ...plugin, ensure: 'removed' })),
    }, testAdminApi);
};

export const tearDown = async () => {
    uuids = {};
    log = [];
    rawLog = [];
    await cleanupKong();
};
