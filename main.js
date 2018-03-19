/**
 *
 * ekey adapter bluefox <dogafox@gmail.com>
 *
 * Adapter loading data from an M-Bus devices
 *
 */
/* jshint -W097 */
/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */

'use strict';

const utils   = require('./lib/utils'); // Get common adapter utils
const adapter = new utils.Adapter('ekey');
const dgram   = require('dgram');
let   devices = {};
let   mServer = null;

adapter.on('ready', main);

adapter.on('message', processMessage);

function onClose(callback) {
    if (mServer) {
        mServer.close();
        mServer = null;
    }

    if (callback) {
        callback();
    }
}

adapter.on('unload', function (callback) {
    onClose(callback);
});

process.on('SIGINT', function () {
    onClose();
});

process.on('uncaughtException', function (err) {
    if (adapter && adapter.log) {
        adapter.log.warn('Exception: ' + err);
    }
    onClose();
});

function processMessage(obj) {
    if (!obj) return;

    if (obj) {
        switch (obj.command) {
            case 'browse':
                let server = dgram.createSocket('udp4');
                let devices = [];
                const browse = new Buffer([0x01, 0x1a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe8, 0x23, 0x18, 0x18]);

                server.on('message', (message, rinfo) => {
                    if (message.toString('base64') !== browse.toString('base64')) {
                        devices.push({ip: rinfo.address});
                    }
                });
                server.on('error', error => {
                    adapter.log.error(error);
                });
                server.on('listening', () => {
                    server.setBroadcast(true);
                    setImmediate(() => {
                        server.send(browse, 0, browse.length, 58009, '255.255.255.255');
                    })
                });
                server.bind(58009);

                setTimeout(() => {
                    server.close();
                    server = null;
                    adapter.sendTo(obj.from, obj.command, {result: devices}, obj.callback);
                }, 3000);
                break;
        }
    }
}

function decodeHome(device, message) {
    const values = message.toString('ascii').split(/[_?]/);
    if (values.length < 6) {
        adapter.log.warn(`Invalid packet length! ${values.join('_')}`);
    } else
    if (values[0] !== '1') {
        adapter.log.warn(`Invalid packet type! ${values[0]}`);
    } else {
        if (values[4] === '1') values[4] = 'OPEN';
        if (values[4] === '2') values[4] = 'REJECT';
        adapter.log.debug(`USER ID: ${values[1]}, Finger ID: ${values[2]}, Serial ID: ${values[3]}, Action: ${values[4]}, Relais: ${values[5]}`);
        const state = device.native.ip + '.';
        adapter.setState(state + 'user',   values[1], true);
        adapter.setState(state + 'finger', values[2], true);
        adapter.setState(state + 'serial', values[3], true);
        adapter.setState(state + 'action', values[4], true);
        adapter.setState(state + 'relay',  values[5], true);
    }
}

function decodeMulti(device, message) {
    const values = message.toString('ascii').split(/[_?]/);
    if (values.length < 6) {
        adapter.log.warn(`Invalid packet length! ${values.join('_')}`);
    } else
    if (values[0] !== '1') {
        adapter.log.warn(`Invalid packet type! ${values[0]}`);
    } else {
        if (values[4] === '1') values[8] = 'OPEN';
        if (values[4] === '2') values[8] = 'REJECT';
        adapter.log.debug(`USER ID: ${values[1]}, Finger ID: ${values[4]}, Serial ID: ${values[6]}, Action: ${values[8]}, Input: ${values[9]}`);
        const state = device.native.ip + '.';
        adapter.setState(state + 'user',        values[1], true);
        adapter.setState(state + 'user_name',   values[2], true);

        // 0 User is disabled
        // 1 User is enabled
        // - undefined
        adapter.setState(state + 'user_status', values[3], true);
        // 1 = left-hand little finger
        // 2 = left-hand ring finger
        //     .
        //     .
        // 0 = right-hand little finger
        //     ,-,= no finger
        adapter.setState(state + 'finger',      values[4], true);
        adapter.setState(state + 'key',         values[5], true);
        adapter.setState(state + 'serial',      values[6], true);
        adapter.setState(state + 'fs_name',     values[7], true);

        // 1 Open
        // 2 Rejection of unknown finger
        // 3 Rejection time zone A
        // 4 Rejection time zone B
        // 5 Rejection inactive
        // 6 Rejection "Only ALWAYS users"
        // 7 FS not coupled to CP
        // 8 digital input
        adapter.setState(state + 'action',      values[8], true);

        // 1 digital input 1
        // 2 digital input 2
        // 3 digital input 3
        // 4 digital input 4
        // - no digital input
        adapter.setState(state + 'input',       values[9], true);
    }
}
function decodeRare(device, message) {
    const nVersion = message[0];
    const nCmd = Buffer.readInt32LE(1);
    const nTerminalID = Buffer.readInt32LE(1);
}

function tasksDeleteDevice(tasks, ip) {
    const id = adapter.namespace + '.devices.' + ip.replace(/[.\s]+/g, '_');
    tasks.push({
        type: 'delete',
        id:   id
    });
    tasks.push({
        type: 'delete',
        id:   id + '.user'
    });
    tasks.push({
        type: 'delete',
        id:   id + '.finger'
    });
    tasks.push({
        type: 'delete',
        id:   id + '.serial'
    });
    tasks.push({
        type: 'delete',
        id:   id + '.action'
    });
    tasks.push({
        type: 'delete',
        id:   id + '.relay'
    });
}

function tasksAddDevice(tasks, ip, protocol) {
    const id = adapter.namespace + '.devices.' + ip.replace(/[.\s]+/g, '_');

    tasks.push({
        type: 'add',
        obj:   {
            _id: id,
            common: {
                name: 'ekey ' + ip
            },
            type: 'channel',
            native: {
                ip: ip,
                protocol: protocol
            }
        }
    });

    tasks.push({
        type: 'add',
        obj:   {
            _id: id + '.user',
            common: {
                name: 'ekey ' + ip + ' user ID',
                write: false,
                read: true,
                type: 'string'
            },
            type: 'state',
            native: {
            }
        }
    });

    tasks.push({
        type: 'add',
        obj:   {
            _id: id + '.finger',
            common: {
                name: 'ekey ' + ip + ' finger ID',
                write: false,
                read: true,
                type: 'string'
            },
            type: 'state',
            native: {
            }
        }
    });

    tasks.push({
        type: 'add',
        obj:   {
            _id: id + '.serial',
            common: {
                name: 'ekey ' + ip + ' serial ID',
                write: false,
                read: true,
                type: 'string'
            },
            type: 'state',
            native: {
            }
        }
    });

    tasks.push({
        type: 'add',
        obj:   {
            _id: id + '.action',
            common: {
                name: 'ekey ' + ip + ' action',
                write: false,
                read: true,
                type: 'string'
            },
            type: 'state',
            native: {
            }
        }
    });

    if (protocol === 'HOME') {
        tasks.push({
            type: 'add',
            obj:   {
                _id: id + '.relay',
                common: {
                    name: 'ekey ' + ip + ' relay',
                    write: false,
                    read: true,
                    type: 'string'
                },
                type: 'state',
                native: {
                }
            }
        });
    }
    if (protocol === 'MULTI') {
        tasks.push({
            type: 'add',
            obj:   {
                _id: id + '.user_name',
                common: {
                    name: 'ekey ' + ip + ' user_name',
                    write: false,
                    read: true,
                    type: 'string'
                },
                type: 'state',
                native: {
                }
            }
        });
        tasks.push({
            type: 'add',
            obj:   {
                _id: id + '.user_status',
                common: {
                    name: 'ekey ' + ip + ' user_status',
                    write: false,
                    read: true,
                    type: 'string'
                },
                type: 'state',
                native: {
                }
            }
        });
        tasks.push({
            type: 'add',
            obj:   {
                _id: id + '.key',
                common: {
                    name: 'ekey ' + ip + ' key',
                    write: false,
                    read: true,
                    type: 'string'
                },
                type: 'state',
                native: {
                }
            }
        });
        tasks.push({
            type: 'add',
            obj:   {
                _id: id + '.fs_name',
                common: {
                    name: 'ekey ' + ip + ' fs_name',
                    write: false,
                    read: true,
                    type: 'string'
                },
                type: 'state',
                native: {
                }
            }
        });
        tasks.push({
            type: 'add',
            obj:   {
                _id: id + '.input',
                common: {
                    name: 'ekey ' + ip + ' input',
                    write: false,
                    read: true,
                    type: 'string'
                },
                type: 'state',
                native: {
                }
            }
        });
    }
}

function processTasks(tasks, callback) {
    if (!tasks || !tasks.length) {
        callback && callback();
    } else {
        let task = tasks.shift();
        switch (task.type) {
            case 'delete':
                adapter.log.debug(`Delete STATE ${task.id}`);
                adapter.delForeignState(task.id, err => {
                    if (err) adapter.log.warn(`Cannot delete state: ${err}`);
                    adapter.delForeignObject(task.id, err => {
                        if (err) adapter.log.warn(`Cannot delete object: ${err}`);
                        setImmediate(processTasks, tasks, callback);
                    });
                });
                break;
            case 'add':
            case 'update':
                adapter.log.debug(`${task.type} STATE ${task.obj._id}`);
                adapter.getForeignObject(task.obj._id, (err, obj) => {
                    if (!obj) {
                        adapter.setForeignObject(task.obj._id, task.obj, err => {
                            if (err) adapter.log.warn(`Cannot set object: ${err}`);
                            setImmediate(processTasks, tasks, callback);
                        });
                    } else {
                        obj.native = task.obj.native;
                        adapter.setForeignObject(obj._id, obj, err => {
                            if (err) adapter.log.warn(`Cannot set object: ${err}`);
                            setImmediate(processTasks, tasks, callback);
                        });
                    }
                });
                break;
            default:
                adapter.log.error(`Unknown task ${JSON.stringify(task)}`);
                setImmediate(processTasks, tasks, callback);
                break;
        }
    }
}

function syncConfig(callback) {
    adapter.getChannelsOf('devices', function (err, channels) {
        let configToDelete = [];
        let configToAdd    = [];
        let k;
        if (adapter.config.devices) {
            for (k = 0; k < adapter.config.devices.length; k++) {
                configToAdd.push(adapter.config.devices[k].ip);
                devices[adapter.config.devices[k].ip] = adapter.config.devices[k].protocol;
            }
        }
        let tasks = [];

        if (channels) {
            for (let j = 0; j < channels.length; j++) {
                let ip = channels[j].native.ip;
                if (!ip) {
                    adapter.log.warn(`No IP address found for ${JSON.stringify(channels[j])}`);
                    continue;
                }

                let pos = configToAdd.indexOf(ip);
                if (pos !== -1) {
                    configToAdd.splice(pos, 1);
                    if (channels[j].native.protocol !== devices[ip]) {
                        channels[j].native.protocol = devices[ip];
                        tasks.push({type: 'update', obj: channels[j]});
                        tasksAddDevice(tasks, channels[j].ip, channels[j].protocol);
                    }
                } else {
                    configToDelete.push(ip);
                }
            }
        }

        if (configToDelete.length) {
            for (let e = 0; e < configToDelete.length; e++) {
                tasksDeleteDevice(tasks, configToDelete[e]);
            }
        }

        processTasks(tasks, function () {
            let tasks = [];
            if (configToAdd.length) {
                for (let r = 0; r < adapter.config.devices.length; r++) {
                    if (configToAdd.indexOf(adapter.config.devices[r].ip) !== -1) {
                        tasksAddDevice(tasks, adapter.config.devices[r].ip, adapter.config.devices[r].protocol);
                    }
                }
            }
            processTasks(tasks, callback);
        });
    });
}

function startServer() {
    mServer = dgram.createSocket('udp4');

    mServer.on('message', function (message, rinfo) {
        adapter.log.debug(rinfo.address + ':' + rinfo.port +' - ' + message.toString('ascii'));
        if (devices[rinfo.address]) {

            if (devices[rinfo.address].native.type === 'HOME') {
                decodeHome(devices[rinfo.address], message);
            } else if (devices[rinfo.address].native.type === 'MULTI') {
                decodeMulti(devices[rinfo.address], message);
            } else if (devices[rinfo.address].native.type === 'RARE') {
                decodeRare(devices[rinfo.address], message);
            } else {
                adapter.log.warn(`unknown communication type for ${rinfo.address}: ${devices[rinfo.address].native.type}`);
            }
        }
    });

    mServer.bind(adapter.config.port);
}

function main() {
    adapter.config.port = parseInt(adapter.config.port, 10) || 56000;

    syncConfig(startServer);
}
