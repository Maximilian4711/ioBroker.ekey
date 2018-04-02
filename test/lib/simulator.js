const dgram   = require('dgram');

function EkeyDevice(options) {

    let server = null;
    let command = 0;
    const browse = new Buffer([0x01, 0x1a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe8, 0x23, 0x18, 0x18]);
    const answer1 = new Buffer([0x01, 0x1b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe8, 0x23, 0x18, 0x18, 0xf1, 0x63, 0x75, 0x2c, 0x79, 0xc5, 0x82, 0xcd, 0xec, 0x3d, 0xfb, 0x75, 0x78, 0xbb, 0x82, 0xdb, 0x89, 0xd3, 0xb5, 0x8a, 0x35, 0x6a, 0x66, 0xd1, 0x7d, 0xe2, 0x68, 0xdf, 0xf1, 0xfd, 0xe1, 0x26, 0x7a, 0x2f, 0x9d, 0xe2, 0x80, 0xbb, 0xaa, 0xed, 0x91, 0x63, 0x6f, 0xdd, 0x5b, 0xd9, 0x0e, 0x9d, 0x67, 0x61, 0xc1, 0x46, 0x04, 0xd4, 0x11, 0xad, 0x54, 0xf5, 0x7d, 0x29, 0x22, 0x51, 0xf6, 0x78]);
    const answer2 = new Buffer([0x01, 0x1b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe8, 0x23, 0x18, 0x18, 0xf1, 0x63, 0x75, 0x2c, 0x79, 0xc5, 0x82, 0xcd, 0xec, 0x3d, 0xfb, 0x75, 0x78, 0xbb, 0x82, 0xdb, 0x89, 0xd3, 0xb5, 0x8a, 0x35, 0x6a, 0x66, 0xd1, 0x7d, 0xe2, 0x68, 0xdf, 0xf1, 0xfd, 0xe1, 0x26, 0x7a, 0x2f, 0x9d, 0xe2, 0x80, 0xbb, 0xaa, 0xed, 0x91, 0x63, 0x6f, 0xdd, 0x5b, 0xd9, 0x0e, 0x9d, 0x67, 0x61, 0xc1, 0x46, 0x04, 0xd4, 0x11, 0xad, 0x54, 0xf5, 0x7d, 0x29, 0x22, 0x51, 0xf6, 0x78, 0x2c, 0xfc, 0xf3, 0x88, 0x1d, 0x9d, 0xff, 0x67]);

    const informs = [
        '1_0046_4_80156809150025_1_2', // accept home
        '1_0000_–_80156809150025_2_-',  // reject home
        '1_0003_-----JOSEF_1_7_2_80156809150025_–GAR_1_-', // multi OK
        '1_0003_-----JOSEF_1_7_2_80156809150025_–GAR_3_-'  // Multi reject
    ];


    this.close = (callback) => {
        if (server) {
            server.close(callback);
            server = null;
        } else {
            if (typeof callback === 'function') callback();
        }
    };

    this.start = () => {
        if (server) {
            return this.close(() => {
                this.start();
            });
        }

        server = dgram.createSocket('udp4');
        server.on('message', (message, rinfo) => {
            if (message.toString('base64') === browse.toString('base64')) {
                server.send(answer1, 0, answer1.length, rinfo.port, rinfo.address);
                server.send(answer2, 0, answer1.length, rinfo.port, rinfo.address);
            }
        });
        server.on('error', error => {
            adapter.log.error(error);
        });
        server.on('listening', () => {
            console.log('Server started on 58009');
            server.setBroadcast(true);
        });

        setInterval(() => {
            server.send(answer2, 0, informs[command].length, 56000, '255.255.255.255');
            command++;
            if (command >= informs.length) command = 0;
        }, 10000);

        server.bind(58009);
    };


    return this;
}

if (module && module.parent) {
    module.exports = EkeyDevice;
} else {
    let ekey = new EkeyDevice();
    ekey.start();
}
