import * as path from 'path';
import { fs, types, util } from 'vortex-api';

interface IGamebryoLO {
  name: string;
  enabled: boolean;
  loadOrder: number;
}

function getEnabledPlugins(state: types.IState,
                           plugins: string[])
                           : Array<{ name: string, enabled: boolean }> {
  const gamebryoLO: { [id: string]: IGamebryoLO } = state['loadOrder'];
  return plugins.map(pluginName => gamebryoLO[pluginName.toLowerCase()])
    .filter(lo => (lo !== undefined) && (lo.name !== undefined))
    .sort((lhs, rhs) => lhs.loadOrder - rhs.loadOrder)
    .map(lo => ({ name: lo.name, enabled: lo.enabled }));
}

interface IUserlistEntry {
  name: string;
  after: string[];
}

interface IGamebryoRules {
  plugins: IUserlistEntry[];
  groups?: IUserlistEntry[];
}

function extractPluginRules(state: types.IState, plugins: string[]): IGamebryoRules {
  const installedPlugins: Set<string> = new Set(plugins.map(name => name.toLowerCase()));
  const customisedPlugins =
    state['userlist'].plugins.filter(plug => installedPlugins.has(plug.name.toLowerCase()));

  // TODO this may be a bit overly simplified.
  // we include the rules on all plugins currently enabled but this may include plugins that
  // aren't included in the pack
  return {
    plugins: customisedPlugins,
    groups: state['loadOrder'].groups,
  };
}

export interface IModPackGamebryo {
  plugins: Array<{ name: string, enabled: boolean }>;
  pluginRules: IGamebryoRules;
}

export async function generate(state: types.IState,
                               gameId: string,
                               stagingPath: string,
                               modIds: string[],
                               mods: { [modId: string]: types.IMod })
                               : Promise<IModPackGamebryo> {
  const includedPlugins: string[] = [];

  const extensions = ['fallout4', 'skyrimse'].indexOf(gameId) === -1
    ? new Set(['.esp', '.esm', '.esl'])
    : new Set(['.esp', '.esm']);

  await Promise.all(modIds.map(async modId => {
    const files = await fs.readdirAsync(path.join(stagingPath, mods[modId].installationPath));
    const plugins = files.filter(fileName => extensions.has(path.extname(fileName).toLowerCase()));
    includedPlugins.push(...plugins);
  }));

  return {
    plugins: getEnabledPlugins(state, includedPlugins),
    pluginRules: extractPluginRules(state, includedPlugins),
  };
}

function toLootType(type: string): string {
  switch (type) {
    case 'requires': return 'req';
    case 'incompatible': return 'inc';
    default: return 'after';
  }
}

function refName(iter: string | { name: string }): string {
  if (typeof(iter) === 'string') {
    return iter;
  } else {
    return iter.name;
  }
}

export async function parser(api: types.IExtensionApi, gameId: string, modpack: IModPackGamebryo) {
  const state: types.IState = api.store.getState();

  /*
  api.store.dispatch({
    type: 'SET_PLUGIN_ORDER',
    payload: modpack.plugins.map(plugin => plugin.name),
  });
  api.store.dispatch({
    type: 'UPDATE_PLUGIN_ORDER',
    payload: {
      pluginList: modpack.plugins.filter(plugin => plugin.enabled).map(plugin => plugin.name),
      setEnabled: true,
    },
  });
  */

  modpack.plugins.forEach(plugin => {
    api.store.dispatch({ type: 'SET_PLUGIN_ENABLED', payload: {
      pluginName: plugin.name,
      enabled: plugin.enabled,
    } });
  });

  // dismiss all "mod x contains multiple plugins" notifications because we're enabling plugins
  // automatically.
  // this is a bit nasty because a) we're string-matching part of the notification id and b) this
  // doesn't take into account the notification may be triggered by a mod _not_ installed through
  // the pack.
  state.session.notifications.notifications
    .filter(noti => noti.id.startsWith('multiple-plugins-'))
    .forEach(noti => api.dismissNotification(noti.id));

  modpack.pluginRules.plugins.forEach(plugin => {
    const existing = (state as any).userlist.plugins.find(plug =>
      plug.name.toUpperCase() === plugin.name.toUpperCase());

    ['requires', 'incompatible', 'after'].forEach(type => {
      const lootType = toLootType(type);
      (plugin[type] || []).forEach(ref => {
        const match = iter => refName(iter).toUpperCase() === ref.toUpperCase();

        if (util.getSafe(existing, [lootType], []).find(match) === undefined) {
          api.store.dispatch({
            type: 'ADD_USERLIST_RULE',
            payload: {
              pluginId: plugin.name.toLowerCase(),
              reference: ref,
              type,
            },
          });
        }
      });
    });
  });
}
