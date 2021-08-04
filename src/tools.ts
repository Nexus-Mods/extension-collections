import { IExtendedInterfaceProps } from './types/IExtendedInterfaceProps';
import ToolList from './views/Tools';

import * as React from 'react';
import { types } from 'vortex-api';

function ToolsListWrap(prop: IExtendedInterfaceProps): JSX.Element {
  return React.createElement(ToolList, {
    ...prop,
  });
}

function init(context: types.IExtensionContext) {
  // the parse/generate functions don't actually have to do anything because
  // initweaks are stored on disk as part of the collection mod and will be bundled
  // automatically
  context.optional['registerCollectionFeature'](
    'tools',
    () => Promise.resolve({}),
    () => Promise.resolve(),
    () => 'Tools',
    (state: types.IState, gameId: string) => true,
    ToolsListWrap);
}

export default init;
