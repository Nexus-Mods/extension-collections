import { types } from 'vortex-api';
import { IExtendedInterfaceProps } from "../types/IExtendedInterfaceProps";

export interface IExtensionFeature {
  id: string;
  generate: (gameId: string, includedMods: string[]) => Promise<any>;
  parse: (gameId: string, collection: any) => Promise<void>;
  title: (t: types.TFunction) => string;
  condition?: (state: types.IState, gameId: string) => boolean;
  editComponent?: React.ComponentType<IExtendedInterfaceProps>;
}

const features: IExtensionFeature[] = [];

export function addExtension(feature: IExtensionFeature) {
  features.push(feature);
}

export function findExtensions(state: types.IState, gameId: string): IExtensionFeature[] {
  return features.filter(iter =>
    (iter.condition === undefined) || iter.condition(state, gameId));
}
