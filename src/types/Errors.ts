export class MissingCollectionModError extends Error {
  private mCollectionId: string;
  constructor(collectionId: string) {
    super(`Unable to find collection mod: ${collectionId}`);
    this.name = 'MissingCollectionModError';
    this.mCollectionId = collectionId;
  }

  public get collectionId(): string {
    return this.mCollectionId;
  }
}
