import validateBZKt from "./ICollection.validate";export function validateICollection(data): any[] {
    var res = validateBZKt(data);
    return (res === false) ? validateBZKt.prototype.constructor.errors : [];
}