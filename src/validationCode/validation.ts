import validateTSUEsFTPU from "./ICollection.validate";export function validateICollection(data): any[] {
    var res = validateTSUEsFTPU(data);
    return (res === false) ? validateTSUEsFTPU.prototype.constructor.errors : [];
}