"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseServerMessage = parseServerMessage;
exports.serializeClientMessage = serializeClientMessage;
function parseServerMessage(raw) {
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
function serializeClientMessage(msg) {
    return JSON.stringify(msg);
}
//# sourceMappingURL=protocol.js.map