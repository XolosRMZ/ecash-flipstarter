"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const PORT = process.env.API_PORT
    ? Number(process.env.API_PORT)
    : process.env.PORT
        ? Number(process.env.PORT)
        : 3000;
app_1.default.listen(PORT, () => {
    console.log(`Flipstarter backend listening on port ${PORT}`);
});
