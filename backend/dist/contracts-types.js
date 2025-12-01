"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mode = void 0;
// Lightweight re-exports to reference contract enums/types within backend without circular build tooling yet.
var Mode;
(function (Mode) {
    Mode[Mode["PLEDGE"] = 0] = "PLEDGE";
    Mode[Mode["FINALIZE"] = 1] = "FINALIZE";
    Mode[Mode["REFUND"] = 2] = "REFUND";
})(Mode || (exports.Mode = Mode = {}));
