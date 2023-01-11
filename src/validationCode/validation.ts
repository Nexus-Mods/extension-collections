import validateKfvCANcB from "./ICollection.validate";export function validateICollection(data): any[] {
    var res = validateKfvCANcB(data);
    return (res === false) ? validateKfvCANcB.prototype.constructor.errors : [];
}