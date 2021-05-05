import * as path from 'path';
import React = require('react');
import { Button, ControlLabel, Table } from 'react-bootstrap';
import { useSelector, useStore } from 'react-redux';
import { fs, Icon, selectors, Spinner, tooltip, types, util } from 'vortex-api';
import { IExtendedInterfaceProps } from '../../types/IExtendedInterfaceProps';

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

export interface ICollectionGamebryo {
  plugins: Array<{ name: string, enabled: boolean }>;
  pluginRules: IGamebryoRules;
}

async function getIncludedPlugins(gameId: string,
                                  stagingPath: string,
                                  mods: { [modId: string]: types.IMod },
                                  modIds: string[])
                                  : Promise<string[]> {
  const extensions = ['fallout4', 'skyrimse'].indexOf(gameId) === -1
    ? new Set(['.esp', '.esm', '.esl'])
    : new Set(['.esp', '.esm']);

  const includedPlugins: string[] = [];

  await Promise.all(modIds.map(async modId => {
    if (mods[modId] !== undefined) {
      const files = await fs.readdirAsync(path.join(stagingPath, mods[modId].installationPath));
      const plugins = files.filter(fileName => extensions.has(path.extname(fileName).toLowerCase()));
      includedPlugins.push(...plugins);
    }
  }));

  return includedPlugins;
}

export async function generate(state: types.IState,
                               gameId: string,
                               stagingPath: string,
                               modIds: string[],
                               mods: { [modId: string]: types.IMod })
                               : Promise<ICollectionGamebryo> {
  const includedPlugins: string[] = await getIncludedPlugins(gameId, stagingPath, mods, modIds);

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

export async function parser(api: types.IExtensionApi,
                             gameId: string,
                             collection: ICollectionGamebryo) {
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

  (collection.plugins ?? []).forEach(plugin => {
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

  (collection.pluginRules?.plugins ?? []).forEach(plugin => {
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

interface ILocalizedMessage {
  lang: string;
  str: string;
}

interface IMessage {
  type: 'say' | 'warn' | 'error';
  content: string | ILocalizedMessage[];
  condition?: string;
  subs?: string[];
}

interface IBashTag {
  name: string;
  condition?: string;
}

type BashTag = string | IBashTag;

interface ILocation {
  link: string;
}

interface IDirtyInfo {
  crc: string;
  util: string;
  itm?: number;
  udr?: number;
  nav?: number;
}

export interface ILootReference {
  name: string;
  display: string;
  condition?: string;
}

interface ILOOTPlugin {
  name: string;
  enabled?: boolean;
  group?: string;
  after?: Array<string | ILootReference>;
  req?: Array<string | ILootReference>;
  inc?: Array<string | ILootReference>;
  msg?: IMessage[];
  tag?: BashTag[];
  url?: ILocation[];
  dirty?: IDirtyInfo[];
}

interface ILOOTGroup {
  name: string;
  after?: string[];
}

interface ILOOTList {
  globals: IMessage[];
  plugins: ILOOTPlugin[];
  groups: ILOOTGroup[];
}

function ruleName(rule: string | ILootReference): string {
  if (typeof(rule) === 'string') {
    return rule;
  } else {
    return rule.display ?? rule.name;
  }
}

function ruleId(rule: string | ILootReference): string {
  if (typeof(rule) === 'string') {
    return rule.toLowerCase();
  } else {
    return rule.name.toLowerCase();
  }
}

function ruleType(t: types.TFunction, type: string): string {
  switch (type) {
    case 'after': return t('after');
    case 'requires': return t('requires');
    case 'incompatible': return t('incompatible with');
    default: return '???';
  }
}

interface IRule {
  name: string;
  ref: string | ILootReference;
  type: string;
}

interface IPluginRuleProps {
  t: types.TFunction;
  rule: IRule;
  onRemove: (pluginId: string, referenceId: string, type: string) => void;
}

export function PluginRule(props: IPluginRuleProps) {
  const { t, onRemove, rule } = props;

  const remove = React.useCallback((evt: React.MouseEvent<any>) => {
    onRemove(rule.name.toLowerCase(), rule.ref as any, rule.type);
  }, [rule]);

  return (
    <tr>
      <td className='collection-plugin-name'>
        {rule.name} <p className='collection-rule-type'>{ruleType(t, rule.type)}</p> {rule.ref}
      </td>
      <td className='collection-plugin-remove'>
        <tooltip.IconButton
          className='btn-embed'
          icon='remove'
          tooltip={t('Remove plugin rule')}
          onClick={remove}
        />
      </td>
    </tr>
  );
}

export function Interface(props: IExtendedInterfaceProps): JSX.Element {
  const { t, collection } = props;

  const [pluginRules, setPluginRules] = React.useState<IRule[]>(null);
  const store = useStore();
  const gameId = useSelector(selectors.activeGameId);
  const mods = useSelector((state: types.IState) => state.persistent.mods[gameId]);
  const userlist: ILOOTList = useSelector((state: any) => state.userlist);

  const state = store.getState();

  React.useEffect(() => {
    // need to get list of mods, then read the directories to figure out which plugins they include
    const modIds = collection.rules
      .map(rule => rule.reference.id)
      .filter(modId => modId !== undefined);

    const stagingPath = selectors.installPath(state);

    getIncludedPlugins(gameId, stagingPath, mods, modIds)
      .then(plugins => {
        const pluginsL = plugins.map(plug => plug.toLowerCase());
        const rules = plugins.reduce((prev: IRule[], plugin: string) => {
          const plug: ILOOTPlugin = (userlist?.plugins ?? [])
            .find(iter => iter.name.toLowerCase() === plugin.toLowerCase());

          const byRef = (name: string | ILootReference): boolean => pluginsL.includes(ruleId(name));
          const toRule = (ref: string | ILootReference, type: string) => ({
            name: plugin,
            ref,
            type,
          });

          if (plug !== undefined) {
            prev.push(...(plug.after ?? []).filter(byRef).map(aft => toRule(aft, 'after')));
            prev.push(...(plug.req ?? []).filter(byRef).map(req => toRule(req, 'requires')));
            prev.push(...(plug.inc ?? []).filter(byRef).map(inc => toRule(inc, 'incompatible')));
          }

          return prev;
        }, []);
        setPluginRules(rules);
      });
  }, [collection, mods, userlist, setPluginRules]);

  const removeRule = React.useCallback((pluginId: string, reference: string, type: string) => {
    store.dispatch({ type: 'REMOVE_USERLIST_RULE', payload: {
      pluginId, reference, type,
    } });
  }, [store]);

  return (
    <div>
      <ControlLabel>
        <p>
          {t('The collection will include your custom load order rules so that '
            + 'users of your collection will get the same load order.')}
          <br/>
          {t('Rules you remove here are also removed from your own setup')}
        </p>
      </ControlLabel>
      {(pluginRules !== null) ? (
        <Table id='collection-userlist-table'>
          <thead>
            <tr>
              <th className='header-plugin-rule'>{t('Rule')}</th>
              <th className='header-remove'>{t('Remove')}</th>
            </tr>
          </thead>
          <tbody>
            {pluginRules.map(rule => (
              <PluginRule
                t={t}
                key={`${rule.name}_after_${rule.ref}`}
                rule={rule}
                onRemove={removeRule}
              />))}
          </tbody>
        </Table>
      ) : <Spinner />
      }
    </div>
  );
}
