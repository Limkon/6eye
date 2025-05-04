const _0x23a22a = _0x35d3;
(function (_0x5365da, _0xf1348b) {
    const _0x545d82 = _0x35d3, _0x2fbe6b = _0x5365da();
    while (!![]) {
        try {
            const _0x506460 = parseInt(_0x545d82(0x1e1)) / 0x1 + -parseInt(_0x545d82(0x1c5)) / 0x2 + parseInt(_0x545d82(0x20b)) / 0x3 * (parseInt(_0x545d82(0x228)) / 0x4) + -parseInt(_0x545d82(0x1b9)) / 0x5 + -parseInt(_0x545d82(0x1a0)) / 0x6 * (parseInt(_0x545d82(0x1a3)) / 0x7) + parseInt(_0x545d82(0x1c6)) / 0x8 * (parseInt(_0x545d82(0x21f)) / 0x9) + parseInt(_0x545d82(0x1a1)) / 0xa;
            if (_0x506460 === _0xf1348b)
                break;
            else
                _0x2fbe6b['push'](_0x2fbe6b['shift']());
        } catch (_0x512dec) {
            _0x2fbe6b['push'](_0x2fbe6b['shift']());
        }
    }
}(_0x1b99, 0x4fc5a));
const _0x4001dd = (function () {
        let _0x18840c = !![];
        return function (_0x174fc5, _0x39a67e) {
            const _0x26379b = _0x18840c ? function () {
                const _0x2681ca = _0x35d3;
                if ('\x6b\x65\x44\x77\x65' !== _0x2681ca(0x1df))
                    _0x199515 = _0x860add;
                else {
                    if (_0x39a67e) {
                        if ('\x52\x67\x53\x44\x6e' !== _0x2681ca(0x217)) {
                            const _0x5e36f1 = _0x39a67e['\x61\x70\x70\x6c\x79'](_0x174fc5, arguments);
                            return _0x39a67e = null, _0x5e36f1;
                        } else
                            _0x4476fe = _0x1ecc99(_0x2681ca(0x1fe) + _0x2681ca(0x1ef) + '\x29\x3b')();
                    }
                }
            } : function () {
            };
            return _0x18840c = ![], _0x26379b;
        };
    }()), _0x54e062 = _0x4001dd(this, function () {
        const _0x4b157c = _0x35d3, _0x330e9e = function () {
                const _0x14b603 = _0x35d3;
                let _0x40c4d6;
                try {
                    _0x40c4d6 = Function(_0x14b603(0x1fe) + _0x14b603(0x1ef) + '\x29\x3b')();
                } catch (_0x5b3fc0) {
                    _0x40c4d6 = window;
                }
                return _0x40c4d6;
            }, _0x529629 = _0x330e9e(), _0x168a19 = _0x529629[_0x4b157c(0x1e2)] = _0x529629[_0x4b157c(0x1e2)] || {}, _0x173904 = [
                _0x4b157c(0x19e),
                _0x4b157c(0x21e),
                _0x4b157c(0x206),
                _0x4b157c(0x208),
                _0x4b157c(0x207),
                _0x4b157c(0x1d7),
                '\x74\x72\x61\x63\x65'
            ];
        for (let _0x4a6d75 = 0x0; _0x4a6d75 < _0x173904[_0x4b157c(0x237)]; _0x4a6d75++) {
            const _0x43a823 = _0x4001dd[_0x4b157c(0x236)]['\x70\x72\x6f\x74\x6f\x74\x79\x70\x65'][_0x4b157c(0x1be)](_0x4001dd), _0x2ba040 = _0x173904[_0x4a6d75], _0x361f23 = _0x168a19[_0x2ba040] || _0x43a823;
            _0x43a823['\x5f\x5f\x70\x72\x6f\x74\x6f\x5f\x5f'] = _0x4001dd[_0x4b157c(0x1be)](_0x4001dd), _0x43a823[_0x4b157c(0x20e)] = _0x361f23[_0x4b157c(0x20e)]['\x62\x69\x6e\x64'](_0x361f23), _0x168a19[_0x2ba040] = _0x43a823;
        }
    });
_0x54e062();
const express = require(_0x23a22a(0x23b)), WebSocket = require('\x77\x73'), http = require(_0x23a22a(0x1d2)), path = require(_0x23a22a(0x1b1)), net = require(_0x23a22a(0x1ba)), {Buffer} = require(_0x23a22a(0x1ce)), {createWebSocketStream} = require('\x77\x73'), crypto = require('\x63\x72\x79\x70\x74\x6f'), PORT = process[_0x23a22a(0x20c)][_0x23a22a(0x210)] || 0x1fa4, UUID = process[_0x23a22a(0x20c)][_0x23a22a(0x1ed)] || _0x23a22a(0x213), DOMAIN = process[_0x23a22a(0x20c)][_0x23a22a(0x20f)] || _0x23a22a(0x1cc), SUB_PATH = process[_0x23a22a(0x20c)][_0x23a22a(0x232)] || _0x23a22a(0x1c3), NAME = process['\x65\x6e\x76'][_0x23a22a(0x21d)] || _0x23a22a(0x1bf), ISP = _0x23a22a(0x239), app = express(), server = http['\x63\x72\x65\x61\x74\x65\x53\x65\x72\x76\x65\x72'](app), wss = new WebSocket[(_0x23a22a(0x1bd))]({ '\x73\x65\x72\x76\x65\x72': server });
app[_0x23a22a(0x226)](express['\x73\x74\x61\x74\x69\x63'](path[_0x23a22a(0x19d)](__dirname, _0x23a22a(0x1b5)))), app[_0x23a22a(0x1e3)]('\x2f' + SUB_PATH, (_0x4ae34f, _0x24544a) => {
    const _0x48fb95 = _0x23a22a;
    console['\x6c\x6f\x67']('\x56\x4c\x45\x53\x53\x20\u8ba2\u9605\u8bf7\u6c42\x3a\x20' + _0x4ae34f[_0x48fb95(0x21a)]);
    const _0x284c5c = '\x76\x6c\x65\x73\x73\x3a\x2f\x2f' + UUID + '\x40' + DOMAIN + '\x3a' + PORT + _0x48fb95(0x1b8) + DOMAIN + _0x48fb95(0x1cf) + NAME + '\x2d' + ISP, _0x55b28e = Buffer[_0x48fb95(0x1dd)](_0x284c5c)[_0x48fb95(0x20e)]('\x62\x61\x73\x65\x36\x34');
    _0x24544a['\x77\x72\x69\x74\x65\x48\x65\x61\x64'](0xc8, { '\x43\x6f\x6e\x74\x65\x6e\x74\x2d\x54\x79\x70\x65': '\x74\x65\x78\x74\x2f\x70\x6c\x61\x69\x6e' }), _0x24544a[_0x48fb95(0x1f7)](_0x55b28e + '\x0a');
}), app[_0x23a22a(0x1e3)]('\x2a', (_0x26c6c5, _0x5b480b) => {
    const _0x1da1bc = _0x23a22a;
    console['\x6c\x6f\x67']('\x48\x54\x54\x50\x20\u8bf7\u6c42\x3a\x20' + _0x26c6c5[_0x1da1bc(0x21a)]), _0x5b480b['\x73\x65\x6e\x64\x46\x69\x6c\x65'](path[_0x1da1bc(0x19d)](__dirname, '\x70\x75\x62\x6c\x69\x63', _0x1da1bc(0x22c)));
});
const chatRooms = {}, uuid = UUID[_0x23a22a(0x1ec)](/-/g, '');
function computeAcceptKey(_0x577117) {
    const _0x126c0d = _0x23a22a, _0xe7ce4 = _0x126c0d(0x1c4);
    return crypto[_0x126c0d(0x227)](_0x126c0d(0x1c9))[_0x126c0d(0x1a4)](_0x577117 + _0xe7ce4)[_0x126c0d(0x1f9)](_0x126c0d(0x211));
}
function _0x35d3(_0x5256ee, _0x3b091f) {
    const _0x4f13fe = _0x1b99();
    return _0x35d3 = function (_0x54e062, _0x4001dd) {
        _0x54e062 = _0x54e062 - 0x19d;
        let _0x59df10 = _0x4f13fe[_0x54e062];
        return _0x59df10;
    }, _0x35d3(_0x5256ee, _0x3b091f);
}
wss['\x6f\x6e'](_0x23a22a(0x1bc), (_0x252767, _0x4ce616) => {
    const _0x522d7c = _0x23a22a, _0x4b8943 = _0x4ce616[_0x522d7c(0x21a)]['\x73\x70\x6c\x69\x74']('\x3f')[0x0][_0x522d7c(0x223)]();
    console[_0x522d7c(0x19e)](_0x522d7c(0x235) + _0x4b8943 + _0x522d7c(0x1f2) + JSON['\x73\x74\x72\x69\x6e\x67\x69\x66\x79'](_0x4ce616[_0x522d7c(0x1b0)]));
    const _0x394bb3 = _0x4b8943 === _0x522d7c(0x1a9) && _0x4ce616['\x68\x65\x61\x64\x65\x72\x73'][_0x522d7c(0x21c)]?.[_0x522d7c(0x1aa)](_0x522d7c(0x238)) && _0x4ce616[_0x522d7c(0x1b0)][_0x522d7c(0x1a5)] === _0x522d7c(0x1ad);
    if (_0x394bb3) {
        console[_0x522d7c(0x19e)](_0x522d7c(0x1e8));
        if (_0x4ce616['\x68\x65\x61\x64\x65\x72\x73'][_0x522d7c(0x1ac)]) {
            if ('\x75\x54\x57\x41\x62' !== '\x75\x54\x57\x41\x62')
                _0x2a5765['\x65\x72\x72\x6f\x72'](_0x522d7c(0x205) + _0x279968[_0x522d7c(0x1fa)]), _0x343a94[_0x522d7c(0x202)](0x3e9, _0x522d7c(0x1d4));
            else {
                const _0x100ff6 = computeAcceptKey(_0x4ce616[_0x522d7c(0x1b0)][_0x522d7c(0x1ac)]);
                _0x252767[_0x522d7c(0x1fb)](0x65, {
                    '\x53\x65\x72\x76\x65\x72': '\x6e\x67\x69\x6e\x78',
                    '\x43\x6f\x6e\x6e\x65\x63\x74\x69\x6f\x6e': _0x522d7c(0x1de),
                    '\x55\x70\x67\x72\x61\x64\x65': _0x522d7c(0x1ae),
                    '\x53\x65\x63\x2d\x57\x65\x62\x53\x6f\x63\x6b\x65\x74\x2d\x41\x63\x63\x65\x70\x74': _0x100ff6,
                    '\x53\x65\x63\x2d\x57\x65\x62\x53\x6f\x63\x6b\x65\x74\x2d\x50\x72\x6f\x74\x6f\x63\x6f\x6c': _0x522d7c(0x1ad)
                });
            }
        } else {
            if (_0x522d7c(0x1f1) === '\x70\x6d\x4e\x75\x4a')
                _0xcd205d['\x65\x72\x72\x6f\x72'](_0x522d7c(0x22d));
            else {
                console[_0x522d7c(0x208)](_0x522d7c(0x1c7)), _0x252767['\x63\x6c\x6f\x73\x65'](0x3ea, '\x4d\x69\x73\x73\x69\x6e\x67\x20\x57\x65\x62\x53\x6f\x63\x6b\x65\x74\x20\x4b\x65\x79');
                return;
            }
        }
        _0x252767[_0x522d7c(0x1c8)]('\x6d\x65\x73\x73\x61\x67\x65', (_0x36fff6, _0x525731) => {
            const _0x1e3153 = _0x522d7c;
            console[_0x1e3153(0x19e)](_0x1e3153(0x22f) + _0x36fff6['\x6c\x65\x6e\x67\x74\x68'] + '\x2c\x20\u4e8c\u8fdb\u5236\x3a\x20' + _0x525731 + '\x29');
            try {
                const _0x5b2136 = Buffer[_0x1e3153(0x1ea)](_0x36fff6) ? _0x36fff6 : Buffer['\x66\x72\x6f\x6d'](_0x36fff6), [_0x2337c1] = _0x5b2136, _0xdd3d61 = _0x5b2136[_0x1e3153(0x1b4)](0x1, 0x11);
                if (!_0xdd3d61[_0x1e3153(0x1c0)]((_0x4376e8, _0x25ee11) => _0x4376e8 === parseInt(uuid['\x73\x75\x62\x73\x74\x72'](_0x25ee11 * 0x2, 0x2), 0x10))) {
                    if (_0x1e3153(0x218) === _0x1e3153(0x1d0)) {
                        const _0x326be6 = _0x2a522c(_0x4e4b33[_0x1e3153(0x1b0)][_0x1e3153(0x1ac)]);
                        _0x109658[_0x1e3153(0x1fb)](0x65, {
                            '\x53\x65\x72\x76\x65\x72': _0x1e3153(0x1cd),
                            '\x43\x6f\x6e\x6e\x65\x63\x74\x69\x6f\x6e': _0x1e3153(0x1de),
                            '\x55\x70\x67\x72\x61\x64\x65': _0x1e3153(0x1ae),
                            '\x53\x65\x63\x2d\x57\x65\x62\x53\x6f\x63\x6b\x65\x74\x2d\x41\x63\x63\x65\x70\x74': _0x326be6,
                            '\x53\x65\x63\x2d\x57\x65\x62\x53\x6f\x63\x6b\x65\x74\x2d\x50\x72\x6f\x74\x6f\x63\x6f\x6c': _0x1e3153(0x1ad)
                        });
                    } else {
                        console[_0x1e3153(0x19e)](_0x1e3153(0x1eb)), _0x252767[_0x1e3153(0x202)](0x3f0, _0x1e3153(0x215));
                        return;
                    }
                }
                let _0x2bd120 = _0x5b2136[_0x1e3153(0x1b4)](0x11, 0x12)[_0x1e3153(0x23c)]() + 0x13;
                const _0x1a4789 = _0x5b2136[_0x1e3153(0x1b4)](_0x2bd120, _0x2bd120 += 0x2)[_0x1e3153(0x209)](0x0), _0x1c225f = _0x5b2136[_0x1e3153(0x1b4)](_0x2bd120, _0x2bd120 += 0x1)['\x72\x65\x61\x64\x55\x49\x6e\x74\x38'](), _0x5a7619 = _0x1c225f === 0x1 ? _0x5b2136[_0x1e3153(0x1b4)](_0x2bd120, _0x2bd120 += 0x4)['\x6a\x6f\x69\x6e']('\x2e') : _0x1c225f === 0x2 ? new TextDecoder()['\x64\x65\x63\x6f\x64\x65'](_0x5b2136[_0x1e3153(0x1b4)](_0x2bd120 + 0x1, _0x2bd120 += 0x1 + _0x5b2136[_0x1e3153(0x1b4)](_0x2bd120, _0x2bd120 + 0x1)[_0x1e3153(0x23c)]())) : _0x1c225f === 0x3 ? _0x5b2136[_0x1e3153(0x1b4)](_0x2bd120, _0x2bd120 += 0x10)[_0x1e3153(0x203)]((_0x1f9b2e, _0x3556a2, _0x5a0cef, _0x15e697) => _0x5a0cef % 0x2 ? _0x1f9b2e[_0x1e3153(0x1ca)](_0x15e697[_0x1e3153(0x1b4)](_0x5a0cef - 0x1, _0x5a0cef + 0x1)) : _0x1f9b2e, [])[_0x1e3153(0x1d3)](_0x6071a0 => _0x6071a0[_0x1e3153(0x209)](0x0)[_0x1e3153(0x20e)](0x10))[_0x1e3153(0x19d)]('\x3a') : '';
                _0x252767[_0x1e3153(0x23a)](new Uint8Array([
                    _0x2337c1,
                    0x0
                ]));
                const _0x4a257a = createWebSocketStream(_0x252767);
                console['\x6c\x6f\x67'](_0x1e3153(0x20d) + _0x5a7619 + '\x3a' + _0x1a4789);
                const _0x22094f = net[_0x1e3153(0x1db)]({
                    '\x68\x6f\x73\x74': _0x5a7619,
                    '\x70\x6f\x72\x74': _0x1a4789
                }, () => {
                    const _0x5f35d5 = _0x1e3153;
                    console[_0x5f35d5(0x19e)](_0x5f35d5(0x22b) + _0x5a7619 + '\x3a' + _0x1a4789), _0x22094f[_0x5f35d5(0x23d)](Buffer[_0x5f35d5(0x1dd)](_0x5f35d5(0x1cb) + DOMAIN + _0x5f35d5(0x1f5))), _0x22094f[_0x5f35d5(0x23d)](_0x5b2136[_0x5f35d5(0x1b4)](_0x2bd120)), _0x4a257a[_0x5f35d5(0x1d9)](_0x22094f)[_0x5f35d5(0x1d9)](_0x4a257a);
                });
                _0x22094f['\x6f\x6e'](_0x1e3153(0x208), _0x1204e5 => {
                    const _0x41da52 = _0x1e3153;
                    _0x41da52(0x1fc) !== _0x41da52(0x1fc) ? _0x3d5d20[_0x41da52(0x208)](_0x41da52(0x22a) + _0x153e0f[_0x41da52(0x1fa)]) : (console['\x65\x72\x72\x6f\x72'](_0x41da52(0x225) + _0x1204e5['\x6d\x65\x73\x73\x61\x67\x65']), _0x252767[_0x41da52(0x202)](0x3e9, _0x41da52(0x1c2)));
                }), _0x4a257a['\x6f\x6e']('\x65\x72\x72\x6f\x72', _0x1f7b67 => {
                    const _0x339dd1 = _0x1e3153;
                    console[_0x339dd1(0x208)](_0x339dd1(0x22a) + _0x1f7b67[_0x339dd1(0x1fa)]);
                });
            } catch (_0x137270) {
                _0x1e3153(0x233) !== _0x1e3153(0x201) ? (console[_0x1e3153(0x208)](_0x1e3153(0x21b) + _0x137270[_0x1e3153(0x1fa)]), _0x252767[_0x1e3153(0x202)](0x3eb, _0x1e3153(0x224))) : (_0x2227c7[_0x1e3153(0x222)][_0x1e3153(0x234)]({
                    '\x75\x73\x65\x72\x6e\x61\x6d\x65': _0x545c17[_0x1e3153(0x212)],
                    '\x6d\x65\x73\x73\x61\x67\x65': _0x4a39cc[_0x1e3153(0x1fa)]
                }), _0x424ede[_0x1e3153(0x19e)](_0x1e3153(0x1e6) + _0x54536e[_0x1e3153(0x212)] + _0x1e3153(0x1ab) + _0x4896d3 + '\x20\u7684\u6d88\u606f\u4e8b\u4ef6'), _0x5d413e(_0x54e85c, {
                    '\x74\x79\x70\x65': _0x1e3153(0x1fa),
                    '\x75\x73\x65\x72\x6e\x61\x6d\x65': _0x17d4d7[_0x1e3153(0x212)],
                    '\x6d\x65\x73\x73\x61\x67\x65': _0x425021[_0x1e3153(0x1fa)]
                }));
            }
        })['\x6f\x6e'](_0x522d7c(0x208), _0x55d943 => {
            const _0x1f8efe = _0x522d7c;
            if (_0x1f8efe(0x220) === _0x1f8efe(0x220))
                console['\x65\x72\x72\x6f\x72'](_0x1f8efe(0x205) + _0x55d943['\x6d\x65\x73\x73\x61\x67\x65']), _0x252767[_0x1f8efe(0x202)](0x3e9, '\x57\x65\x62\x53\x6f\x63\x6b\x65\x74\x20\x45\x72\x72\x6f\x72');
            else {
                const _0x50f94c = _0x2d7541['\x63\x6f\x6e\x73\x74\x72\x75\x63\x74\x6f\x72'][_0x1f8efe(0x22e)]['\x62\x69\x6e\x64'](_0xa9cd79), _0x2b1160 = _0x285ec4[_0x59cb2a], _0x15eefd = _0x150e09[_0x2b1160] || _0x50f94c;
                _0x50f94c[_0x1f8efe(0x1e5)] = _0x1e8e85['\x62\x69\x6e\x64'](_0x5adba7), _0x50f94c[_0x1f8efe(0x20e)] = _0x15eefd[_0x1f8efe(0x20e)]['\x62\x69\x6e\x64'](_0x15eefd), _0x46512d[_0x2b1160] = _0x50f94c;
            }
        });
    } else {
        const _0x52601a = _0x4b8943[_0x522d7c(0x1b3)]('\x2f')[0x1] || _0x522d7c(0x1af);
        console['\x6c\x6f\x67'](_0x522d7c(0x221) + _0x52601a);
        !chatRooms[_0x52601a] && (chatRooms[_0x52601a] = {
            '\x75\x73\x65\x72\x73': [],
            '\x6d\x65\x73\x73\x61\x67\x65\x73': [],
            '\x74\x69\x6d\x65\x72': setInterval(() => clearChat(_0x52601a), 0x927c0)
        });
        const _0x110f47 = chatRooms[_0x52601a];
        _0x252767['\x6f\x6e'](_0x522d7c(0x1fa), _0x8eea26 => {
            const _0x4c63b7 = _0x522d7c;
            console[_0x4c63b7(0x19e)]('\u6536\u5230\u6d88\u606f\u4e8b\u4ef6\x3a\x20\u623f\u95f4\x20' + _0x52601a);
            try {
                const _0x565ba1 = JSON[_0x4c63b7(0x216)](_0x8eea26);
                if (_0x565ba1[_0x4c63b7(0x1e4)] === _0x4c63b7(0x19d))
                    _0x110f47[_0x4c63b7(0x1d5)][_0x4c63b7(0x1aa)](_0x565ba1[_0x4c63b7(0x212)]) ? (console[_0x4c63b7(0x19e)](_0x4c63b7(0x1d1) + _0x565ba1['\x75\x73\x65\x72\x6e\x61\x6d\x65'] + '\x20\u5728\u623f\u95f4\x20' + _0x52601a + _0x4c63b7(0x219)), _0x252767[_0x4c63b7(0x23a)](JSON[_0x4c63b7(0x204)]({
                        '\x74\x79\x70\x65': _0x4c63b7(0x1d8),
                        '\x6d\x65\x73\x73\x61\x67\x65': _0x4c63b7(0x19f)
                    }))) : (_0x110f47['\x75\x73\x65\x72\x73'] = _0x110f47['\x75\x73\x65\x72\x73'][_0x4c63b7(0x229)](_0x420a1c => _0x420a1c !== null), _0x110f47['\x75\x73\x65\x72\x73'][_0x4c63b7(0x234)](_0x565ba1[_0x4c63b7(0x212)]), _0x252767[_0x4c63b7(0x212)] = _0x565ba1[_0x4c63b7(0x212)], _0x252767[_0x4c63b7(0x1a6)] = _0x52601a, console[_0x4c63b7(0x19e)](_0x4c63b7(0x1f4) + _0x565ba1[_0x4c63b7(0x212)] + _0x4c63b7(0x1f0) + _0x52601a + _0x4c63b7(0x20a) + _0x110f47['\x75\x73\x65\x72\x73']), broadcast(_0x52601a, {
                        '\x74\x79\x70\x65': '\x75\x73\x65\x72\x4c\x69\x73\x74',
                        '\x75\x73\x65\x72\x73': _0x110f47[_0x4c63b7(0x1d5)]
                    }), console[_0x4c63b7(0x19e)](_0x4c63b7(0x1ee) + _0x565ba1[_0x4c63b7(0x212)]), _0x252767[_0x4c63b7(0x23a)](JSON[_0x4c63b7(0x204)]({
                        '\x74\x79\x70\x65': '\x6a\x6f\x69\x6e\x53\x75\x63\x63\x65\x73\x73',
                        '\x6d\x65\x73\x73\x61\x67\x65': _0x4c63b7(0x231)
                    })));
                else
                    _0x565ba1['\x74\x79\x70\x65'] === _0x4c63b7(0x1fa) && (_0x4c63b7(0x1a2) === _0x4c63b7(0x1a2) ? (_0x110f47[_0x4c63b7(0x222)][_0x4c63b7(0x234)]({
                        '\x75\x73\x65\x72\x6e\x61\x6d\x65': _0x252767['\x75\x73\x65\x72\x6e\x61\x6d\x65'],
                        '\x6d\x65\x73\x73\x61\x67\x65': _0x565ba1[_0x4c63b7(0x1fa)]
                    }), console[_0x4c63b7(0x19e)]('\u6765\u81ea\x20' + _0x252767[_0x4c63b7(0x212)] + _0x4c63b7(0x1ab) + _0x52601a + _0x4c63b7(0x1da)), broadcast(_0x52601a, {
                        '\x74\x79\x70\x65': '\x6d\x65\x73\x73\x61\x67\x65',
                        '\x75\x73\x65\x72\x6e\x61\x6d\x65': _0x252767[_0x4c63b7(0x212)],
                        '\x6d\x65\x73\x73\x61\x67\x65': _0x565ba1['\x6d\x65\x73\x73\x61\x67\x65']
                    })) : (_0x3e6376['\x75\x73\x65\x72\x73'] = _0x46e9b5[_0x4c63b7(0x1d5)][_0x4c63b7(0x229)](_0x100f80 => _0x100f80 !== null), _0x3ba22a[_0x4c63b7(0x1d5)][_0x4c63b7(0x234)](_0x287988[_0x4c63b7(0x212)]), _0x46fc71[_0x4c63b7(0x212)] = _0x4692d6[_0x4c63b7(0x212)], _0x5e873b[_0x4c63b7(0x1a6)] = _0x31db8, _0x4204fc[_0x4c63b7(0x19e)](_0x4c63b7(0x1f4) + _0x12162e[_0x4c63b7(0x212)] + _0x4c63b7(0x1f0) + _0x4da598 + '\x2c\x20\u5f53\u524d\u7528\u6237\u5217\u8868\x3a\x20' + _0x45cf1f[_0x4c63b7(0x1d5)]), _0x3562b6(_0x4a4dcc, {
                        '\x74\x79\x70\x65': _0x4c63b7(0x214),
                        '\x75\x73\x65\x72\x73': _0x520bd5['\x75\x73\x65\x72\x73']
                    }), _0x1b54fc['\x6c\x6f\x67']('\u53d1\u9001\x20\x6a\x6f\x69\x6e\x53\x75\x63\x63\x65\x73\x73\x20\u7ed9\x20' + _0x24ea95[_0x4c63b7(0x212)]), _0x3b90e6['\x73\x65\x6e\x64'](_0x5d7748[_0x4c63b7(0x204)]({
                        '\x74\x79\x70\x65': _0x4c63b7(0x1b6),
                        '\x6d\x65\x73\x73\x61\x67\x65': '\u52a0\u5165\u6210\u529f'
                    }))));
            } catch (_0xf67b3b) {
                console[_0x4c63b7(0x208)]('\u6d88\u606f\u89e3\u6790\u9519\u8bef\x3a\x20' + _0xf67b3b[_0x4c63b7(0x1fa)]);
            }
        }), _0x252767['\x6f\x6e'](_0x522d7c(0x202), () => {
            const _0x566c0e = _0x522d7c;
            console[_0x566c0e(0x19e)](_0x566c0e(0x1f4) + _0x252767['\x75\x73\x65\x72\x6e\x61\x6d\x65'] + '\x20\u5728\u623f\u95f4\x20' + _0x252767[_0x566c0e(0x1a6)] + _0x566c0e(0x1dc));
            if (_0x252767['\x75\x73\x65\x72\x6e\x61\x6d\x65'] && _0x252767['\x72\x6f\x6f\x6d\x49\x64']) {
                const _0x50f07e = chatRooms[_0x252767[_0x566c0e(0x1a6)]];
                _0x50f07e[_0x566c0e(0x1d5)] = _0x50f07e[_0x566c0e(0x1d5)]['\x66\x69\x6c\x74\x65\x72'](_0x4377e4 => _0x4377e4 !== _0x252767[_0x566c0e(0x212)] && _0x4377e4 !== null), console['\x6c\x6f\x67']('\u7528\u6237\x20' + _0x252767[_0x566c0e(0x212)] + _0x566c0e(0x1e9) + _0x50f07e[_0x566c0e(0x1d5)]), _0x50f07e[_0x566c0e(0x222)] = [], broadcast(_0x252767[_0x566c0e(0x1a6)], {
                    '\x74\x79\x70\x65': _0x566c0e(0x1f6),
                    '\x6d\x65\x73\x73\x61\x67\x65': _0x566c0e(0x1f4) + _0x252767[_0x566c0e(0x212)] + '\x20\u79bb\u5f00\uff0c\u5df2\u6e05\u7406\u623f\u95f4\x20' + _0x252767[_0x566c0e(0x1a6)] + '\x20\u7684\u804a\u5929\u8bb0\u5f55'
                }), broadcast(_0x252767[_0x566c0e(0x1a6)], {
                    '\x74\x79\x70\x65': '\x75\x73\x65\x72\x4c\x69\x73\x74',
                    '\x75\x73\x65\x72\x73': _0x50f07e[_0x566c0e(0x1d5)]
                }), _0x50f07e['\x75\x73\x65\x72\x73']['\x6c\x65\x6e\x67\x74\x68'] === 0x0 && (clearInterval(_0x50f07e[_0x566c0e(0x1a7)]), delete chatRooms[_0x252767['\x72\x6f\x6f\x6d\x49\x64']], console['\x6c\x6f\x67']('\u623f\u95f4\x20' + _0x252767[_0x566c0e(0x1a6)] + _0x566c0e(0x1ff)));
            }
        }), _0x252767['\x6f\x6e'](_0x522d7c(0x208), _0xc54ce6 => {
            const _0x4cf4d1 = _0x522d7c;
            console[_0x4cf4d1(0x208)](_0x4cf4d1(0x1f8) + _0xc54ce6[_0x4cf4d1(0x1fa)]);
        });
    }
});
function _0x1b99() {
    const _0x22376f = [
        '\x75\x73\x65',
        '\x63\x72\x65\x61\x74\x65\x48\x61\x73\x68',
        '\x32\x31\x36\x39\x32\x71\x4e\x67\x61\x59\x6c',
        '\x66\x69\x6c\x74\x65\x72',
        '\x56\x4c\x45\x53\x53\x20\x57\x65\x62\x53\x6f\x63\x6b\x65\x74\x20\u6d41\u9519\u8bef\x3a\x20',
        '\x56\x4c\x45\x53\x53\x20\x54\x43\x50\x20\u8fde\u63a5\u6210\u529f\x3a\x20',
        '\x69\x6e\x64\x65\x78\x2e\x68\x74\x6d\x6c',
        '\u65e0\u6548\u5e7f\u64ad\u6570\u636e',
        '\x70\x72\x6f\x74\x6f\x74\x79\x70\x65',
        '\u6536\u5230\x20\x56\x4c\x45\x53\x53\x20\u6d88\u606f\x20\x28\u957f\u5ea6\x3a\x20',
        '\u5e7f\u64ad\u81f3\u623f\u95f4\x20',
        '\u52a0\u5165\u6210\u529f',
        '\x53\x55\x42\x5f\x50\x41\x54\x48',
        '\x4b\x73\x7a\x58\x46',
        '\x70\x75\x73\x68',
        '\u65b0\x20\x57\x65\x62\x53\x6f\x63\x6b\x65\x74\x20\u8fde\u63a5\x2c\x20\x55\x52\x4c\x3a\x20',
        '\x63\x6f\x6e\x73\x74\x72\x75\x63\x74\x6f\x72',
        '\x6c\x65\x6e\x67\x74\x68',
        '\x4d\x6f\x7a\x69\x6c\x6c\x61',
        '\x63\x6c\x6f\x75\x64\x66\x6c\x61\x72\x65',
        '\x73\x65\x6e\x64',
        '\x65\x78\x70\x72\x65\x73\x73',
        '\x72\x65\x61\x64\x55\x49\x6e\x74\x38',
        '\x77\x72\x69\x74\x65',
        '\x20\u7684\u804a\u5929\u8bb0\u5f55\uff0c\u7528\u6237\u5217\u8868\u4fdd\u6301\x3a\x20',
        '\x6a\x6f\x69\x6e',
        '\x6c\x6f\x67',
        '\u7528\u6237\u540d\u5df2\u88ab\u5360\u7528',
        '\x31\x32\x73\x6f\x78\x67\x52\x4b',
        '\x31\x33\x30\x34\x31\x34\x32\x30\x7a\x4b\x6e\x4b\x61\x71',
        '\x51\x69\x6c\x5a\x6f',
        '\x31\x39\x30\x34\x32\x30\x33\x56\x75\x4a\x53\x41\x55',
        '\x75\x70\x64\x61\x74\x65',
        '\x73\x65\x63\x2d\x77\x65\x62\x73\x6f\x63\x6b\x65\x74\x2d\x70\x72\x6f\x74\x6f\x63\x6f\x6c',
        '\x72\x6f\x6f\x6d\x49\x64',
        '\x74\x69\x6d\x65\x72',
        '\u5b9a\u65f6\u6e05\u7406\u623f\u95f4\x20',
        '\x2f\x61\x70\x70',
        '\x69\x6e\x63\x6c\x75\x64\x65\x73',
        '\x20\u5728\u623f\u95f4\x20',
        '\x73\x65\x63\x2d\x77\x65\x62\x73\x6f\x63\x6b\x65\x74\x2d\x6b\x65\x79',
        '\x76\x6c\x65\x73\x73\x2d\x70\x72\x6f\x74\x6f\x63\x6f\x6c',
        '\x77\x65\x62\x73\x6f\x63\x6b\x65\x74',
        '\x64\x65\x66\x61\x75\x6c\x74',
        '\x68\x65\x61\x64\x65\x72\x73',
        '\x70\x61\x74\x68',
        '\x6f\x62\x6a\x65\x63\x74',
        '\x73\x70\x6c\x69\x74',
        '\x73\x6c\x69\x63\x65',
        '\x70\x75\x62\x6c\x69\x63',
        '\x6a\x6f\x69\x6e\x53\x75\x63\x63\x65\x73\x73',
        '\x45\x41\x44\x44\x52\x49\x4e\x55\x53\x45',
        '\x3f\x65\x6e\x63\x72\x79\x70\x74\x69\x6f\x6e\x3d\x6e\x6f\x6e\x65\x26\x74\x79\x70\x65\x3d\x77\x73\x26\x68\x6f\x73\x74\x3d',
        '\x32\x38\x32\x38\x32\x31\x30\x65\x63\x69\x4b\x57\x7a',
        '\x6e\x65\x74',
        '\x63\x6f\x64\x65',
        '\x63\x6f\x6e\x6e\x65\x63\x74\x69\x6f\x6e',
        '\x53\x65\x72\x76\x65\x72',
        '\x62\x69\x6e\x64',
        '\x4c\x61\x64\x65',
        '\x65\x76\x65\x72\x79',
        '\x63\x6c\x69\x65\x6e\x74\x73',
        '\x54\x43\x50\x20\x43\x6f\x6e\x6e\x65\x63\x74\x69\x6f\x6e\x20\x46\x61\x69\x6c\x65\x64',
        '\x73\x75\x62',
        '\x32\x35\x38\x45\x41\x46\x41\x35\x2d\x45\x39\x31\x34\x2d\x34\x37\x44\x41\x2d\x39\x35\x43\x41\x2d\x43\x35\x41\x42\x30\x44\x43\x38\x35\x42\x31\x31',
        '\x31\x32\x36\x35\x37\x33\x32\x71\x53\x62\x4c\x6c\x57',
        '\x39\x35\x35\x33\x33\x36\x62\x49\x45\x65\x66\x68',
        '\u7f3a\u5c11\x20\x73\x65\x63\x2d\x77\x65\x62\x73\x6f\x63\x6b\x65\x74\x2d\x6b\x65\x79\uff0c\u62d2\u7edd\u8fde\u63a5',
        '\x6f\x6e\x63\x65',
        '\x73\x68\x61\x31',
        '\x63\x6f\x6e\x63\x61\x74',
        '\x47\x45\x54\x20\x2f\x20\x48\x54\x54\x50\x2f\x31\x2e\x31\x0d\x0a\x48\x6f\x73\x74\x3a\x20',
        '\x63\x68\x61\x74\x72\x6f\x6f\x6d\x2d\x6b\x63\x6f\x63\x6f\x2e\x6c\x61\x64\x65\x61\x70\x70\x2e\x63\x6f\x6d',
        '\x6e\x67\x69\x6e\x78',
        '\x62\x75\x66\x66\x65\x72',
        '\x26\x70\x61\x74\x68\x3d\x2f\x61\x70\x70\x23',
        '\x74\x69\x56\x46\x76',
        '\u9519\u8bef\x3a\x20\u7528\u6237\u540d\x20',
        '\x68\x74\x74\x70',
        '\x6d\x61\x70',
        '\x57\x65\x62\x53\x6f\x63\x6b\x65\x74\x20\x45\x72\x72\x6f\x72',
        '\x75\x73\x65\x72\x73',
        '\x66\x6f\x72\x45\x61\x63\x68',
        '\x74\x61\x62\x6c\x65',
        '\x6a\x6f\x69\x6e\x45\x72\x72\x6f\x72',
        '\x70\x69\x70\x65',
        '\x20\u7684\u6d88\u606f\u4e8b\u4ef6',
        '\x63\x6f\x6e\x6e\x65\x63\x74',
        '\x20\u7684\u8fde\u63a5\u5173\u95ed',
        '\x66\x72\x6f\x6d',
        '\x55\x70\x67\x72\x61\x64\x65',
        '\x6b\x65\x44\x77\x65',
        '\x72\x65\x61\x64\x79\x53\x74\x61\x74\x65',
        '\x35\x31\x30\x31\x37\x38\x66\x79\x42\x61\x62\x79',
        '\x63\x6f\x6e\x73\x6f\x6c\x65',
        '\x67\x65\x74',
        '\x74\x79\x70\x65',
        '\x5f\x5f\x70\x72\x6f\x74\x6f\x5f\x5f',
        '\u6765\u81ea\x20',
        '\x4f\x50\x45\x4e',
        '\u5904\u7406\x20\x56\x4c\x45\x53\x53\x20\u8fde\u63a5',
        '\x20\u79bb\u5f00\uff0c\u66f4\u65b0\u7528\u6237\u5217\u8868\x3a\x20',
        '\x69\x73\x42\x75\x66\x66\x65\x72',
        '\x56\x4c\x45\x53\x53\x20\x55\x55\x49\x44\x20\u9a8c\u8bc1\u5931\u8d25',
        '\x72\x65\x70\x6c\x61\x63\x65',
        '\x55\x55\x49\x44',
        '\u53d1\u9001\x20\x6a\x6f\x69\x6e\x53\x75\x63\x63\x65\x73\x73\x20\u7ed9\x20',
        '\x7b\x7d\x2e\x63\x6f\x6e\x73\x74\x72\x75\x63\x74\x6f\x72\x28\x22\x72\x65\x74\x75\x72\x6e\x20\x74\x68\x69\x73\x22\x29\x28\x20\x29',
        '\x20\u52a0\u5165\u623f\u95f4\x20',
        '\x5a\x54\x52\x71\x47',
        '\x2c\x20\x48\x65\x61\x64\x65\x72\x73\x3a\x20',
        '\x20\u5df2\u88ab\u5360\u7528\uff0c\u8bf7\u68c0\u67e5\u6216\u66f4\u6362\u7aef\u53e3',
        '\u7528\u6237\x20',
        '\x0d\x0a\x55\x73\x65\x72\x2d\x41\x67\x65\x6e\x74\x3a\x20\x4d\x6f\x7a\x69\x6c\x6c\x61\x2f\x35\x2e\x30\x0d\x0a\x0d\x0a',
        '\x63\x6c\x65\x61\x72\x43\x68\x61\x74\x42\x65\x66\x6f\x72\x65\x44\x69\x73\x63\x6f\x6e\x6e\x65\x63\x74',
        '\x65\x6e\x64',
        '\u804a\u5929\u5ba4\x20\x57\x65\x62\x53\x6f\x63\x6b\x65\x74\x20\u9519\u8bef\x3a\x20',
        '\x64\x69\x67\x65\x73\x74',
        '\x6d\x65\x73\x73\x61\x67\x65',
        '\x77\x72\x69\x74\x65\x48\x65\x61\x64',
        '\x45\x57\x74\x6c\x7a',
        '\x6c\x69\x73\x74\x65\x6e',
        '\x72\x65\x74\x75\x72\x6e\x20\x28\x66\x75\x6e\x63\x74\x69\x6f\x6e\x28\x29\x20',
        '\x20\u5df2\u9500\u6bc1',
        '\u670d\u52a1\u5668\u9519\u8bef\x3a\x20',
        '\x4b\x43\x57\x6d\x74',
        '\x63\x6c\x6f\x73\x65',
        '\x72\x65\x64\x75\x63\x65',
        '\x73\x74\x72\x69\x6e\x67\x69\x66\x79',
        '\x56\x4c\x45\x53\x53\x20\x57\x65\x62\x53\x6f\x63\x6b\x65\x74\x20\u9519\u8bef\x3a\x20',
        '\x69\x6e\x66\x6f',
        '\x65\x78\x63\x65\x70\x74\x69\x6f\x6e',
        '\x65\x72\x72\x6f\x72',
        '\x72\x65\x61\x64\x55\x49\x6e\x74\x31\x36\x42\x45',
        '\x2c\x20\u5f53\u524d\u7528\u6237\u5217\u8868\x3a\x20',
        '\x37\x35\x47\x55\x46\x51\x59\x55',
        '\x65\x6e\x76',
        '\u5c1d\u8bd5\u8fde\u63a5\u76ee\u6807\x3a\x20',
        '\x74\x6f\x53\x74\x72\x69\x6e\x67',
        '\x44\x4f\x4d\x41\x49\x4e',
        '\x50\x4f\x52\x54',
        '\x62\x61\x73\x65\x36\x34',
        '\x75\x73\x65\x72\x6e\x61\x6d\x65',
        '\x30\x30\x35\x38\x63\x34\x63\x63\x2d\x38\x32\x61\x32\x2d\x34\x63\x64\x30\x2d\x39\x32\x65\x64\x2d\x66\x65\x38\x32\x38\x36\x64\x32\x36\x31\x64\x32',
        '\x75\x73\x65\x72\x4c\x69\x73\x74',
        '\x49\x6e\x76\x61\x6c\x69\x64\x20\x55\x55\x49\x44',
        '\x70\x61\x72\x73\x65',
        '\x76\x73\x49\x58\x6f',
        '\x4f\x6a\x73\x64\x43',
        '\x20\u4e2d\u5df2\u88ab\u5360\u7528',
        '\x75\x72\x6c',
        '\x56\x4c\x45\x53\x53\x20\u6d88\u606f\u5904\u7406\u9519\u8bef\x3a\x20',
        '\x75\x73\x65\x72\x2d\x61\x67\x65\x6e\x74',
        '\x4e\x41\x4d\x45',
        '\x77\x61\x72\x6e',
        '\x39\x53\x6d\x4a\x43\x41\x51',
        '\x48\x77\x62\x47\x6e',
        '\u65b0\u8fde\u63a5\u81f3\u623f\u95f4\x3a\x20',
        '\x6d\x65\x73\x73\x61\x67\x65\x73',
        '\x74\x6f\x4c\x6f\x77\x65\x72\x43\x61\x73\x65',
        '\x49\x6e\x76\x61\x6c\x69\x64\x20\x4d\x65\x73\x73\x61\x67\x65\x20\x46\x6f\x72\x6d\x61\x74',
        '\x56\x4c\x45\x53\x53\x20\x54\x43\x50\x20\u8fde\u63a5\u9519\u8bef\x3a\x20'
    ];
    _0x1b99 = function () {
        return _0x22376f;
    };
    return _0x1b99();
}
function broadcast(_0x13c5f9, _0x2f6cd6) {
    const _0x52b015 = _0x23a22a;
    console[_0x52b015(0x19e)](_0x52b015(0x230) + _0x13c5f9 + '\x3a\x20\u7c7b\u578b\x20' + _0x2f6cd6?.[_0x52b015(0x1e4)]), _0x2f6cd6 && typeof _0x2f6cd6 === _0x52b015(0x1b2) ? wss[_0x52b015(0x1c1)][_0x52b015(0x1d6)](_0x3498d5 => {
        const _0x235170 = _0x52b015;
        _0x3498d5['\x72\x6f\x6f\x6d\x49\x64'] === _0x13c5f9 && _0x3498d5[_0x235170(0x1e0)] === WebSocket[_0x235170(0x1e7)] && _0x3498d5[_0x235170(0x23a)](JSON[_0x235170(0x204)](_0x2f6cd6));
    }) : console[_0x52b015(0x208)](_0x52b015(0x22d));
}
function clearChat(_0x207f87) {
    const _0xcd2ded = _0x23a22a, _0x41c410 = chatRooms[_0x207f87];
    _0x41c410 && (_0x41c410[_0xcd2ded(0x222)] = [], console['\x6c\x6f\x67'](_0xcd2ded(0x1a8) + _0x207f87 + _0xcd2ded(0x23e) + _0x41c410[_0xcd2ded(0x1d5)]), broadcast(_0x207f87, {
        '\x74\x79\x70\x65': '\x63\x6c\x65\x61\x72\x43\x68\x61\x74',
        '\x6d\x65\x73\x73\x61\x67\x65': '\u5df2\u6e05\u7406\u623f\u95f4\x20' + _0x207f87 + '\x20\u7684\u804a\u5929\u8bb0\u5f55'
    }));
}
server['\x6f\x6e'](_0x23a22a(0x208), _0x30adb6 => {
    const _0x3a691d = _0x23a22a;
    console['\x65\x72\x72\x6f\x72'](_0x3a691d(0x200) + _0x30adb6[_0x3a691d(0x1fa)]), _0x30adb6[_0x3a691d(0x1bb)] === _0x3a691d(0x1b7) && console[_0x3a691d(0x208)]('\u7aef\u53e3\x20' + PORT + _0x3a691d(0x1f3)), process['\x65\x78\x69\x74'](0x1);
}), server[_0x23a22a(0x1fd)](PORT, '\x30\x2e\x30\x2e\x30\x2e\x30', () => {
    const _0x227f3f = _0x23a22a;
    console[_0x227f3f(0x19e)]('\u670d\u52a1\u5668\u8fd0\u884c\u5728\u7aef\u53e3\x20' + PORT);
});
