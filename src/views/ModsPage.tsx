import findModByRef from '../util/findModByRef';

import { TranslationFunction } from 'i18next';
import * as _ from 'lodash';
import * as React from 'react';
import { ComponentEx, ITableRowAction, Table, types, util } from 'vortex-api';

export interface IModsPageProps {
  t: TranslationFunction;
  modpack: types.IMod;
  mods: { [modId: string]: types.IMod };
  onSetModVersion: (modId: string, version: 'exact' | 'newest') => void;
  onAddRule: (rule: types.IModRule) => void;
  onRemoveRule: (rule: types.IModRule) => void;
  onSetModpackAttribute: (path: string[], value: any) => void;
}

interface IModEntry {
  rule: types.IModRule;
  mod: types.IMod;
}

interface IModsPageState {
  entries: { [modId: string]: IModEntry };
}

type IProps = IModsPageProps;

class ModsPage extends ComponentEx<IProps, IModsPageState> {
  private mColumns: Array<types.ITableAttribute<IModEntry>> = [
    {
      id: 'name',
      name: 'Mod Name',
      description: 'Mod Name',
      calc: (entry: IModEntry) => util.renderModName(entry.mod),
      placement: 'table',
      edit: {},
      isDefaultSort: true,
      isSortable: true,
    }, {
      id: 'version',
      name: 'Version',
      description: 'The version to install',
      calc: (mod: IModEntry) => {
        if (mod.rule.reference.versionMatch === '*') {
          return 'Latest available update';
        } else {
          return 'Exactly this version';
        }
      },
      placement: 'table',
      edit: {
        inline: true,
        actions: false,
        choices: () => [
          { key: 'exact', text: 'Exactly this version' },
          { key: 'newest', text: 'Latest available update' }],
        onChangeValue: (source: IModEntry, value: any) => {
          this.props.onRemoveRule(source.rule);
          const newRule = _.cloneDeep(source.rule);
          newRule.reference.versionMatch = value === 'exact'
            ? source.mod.attributes['version']
            : '*';
          this.props.onAddRule(newRule);
        },
      },
    }, {
      id: 'required',
      name: 'Required',
      description: 'Whether the entire mod pack will fail if this mod is missingü',
      calc: (mod: IModEntry) => {
        return mod.rule.type === 'requires'
          ? 'Required'
          : 'Optional';
      },
      placement: 'table',
      edit: {
        inline: true,
        actions: false,
        choices: () => [
          { key: 'required', text: 'Required' },
          { key: 'optional', text: 'Optional' },
        ],
        onChangeValue: (source: IModEntry, value: any) => {
          this.props.onRemoveRule(source.rule);
          const newRule = _.cloneDeep(source.rule);
          newRule.type = value === 'optional' ? 'recommends' : 'requires';
          this.props.onAddRule(newRule);
        },
      },
    }, {
      id: 'install-type',
      name: 'Install',
      description: 'How the mod should be installed on the user system',
      calc: (entry: IModEntry) => {
        const { modpack } = this.props;
        const fresh =
          util.getSafe(modpack, ['attributes', 'modpack', 'freshInstall', entry.mod.id], true);
        return fresh
          ? 'Fresh Install'
          : 'Replicate';
      },
      placement: 'table',
      help: 'If set to "Fresh Install" the mod will simply be installed fresh on the users system, '
          + 'installer (if applicable) and everything.\n'
          + 'If set to "Replicate" will try to replicate your exact setup for this mod. This '
          + 'does not bundle the mod itself but the list of files to install and patches if '
          + 'necessary. This may increase the size of the mod pack and the time it takes to '
          + 'export it considerably.',
      edit: {
        inline: true,
        actions: false,
        choices: () => [
          { key: 'fresh', text: 'Fresh Install' },
          { key: 'clone', text: 'Replicate' },
        ],
        onChangeValue: (entry: IModEntry, value: any) => {
          this.props.onSetModpackAttribute(
            ['freshInstall', entry.mod.id], value === 'Fresh Install');
          // nop
        },
      },
    }, {
      id: 'source',
      name: 'Source',
      description: 'How the user gets the mod',
      calc: (mod: IModEntry) => {
        return 'Nexus Mods';
      },
      placement: 'table',
      edit: {
        inline: true,
        actions: false,
        choices: () => [
          { key: 'nexus', text: 'Nexus Mods' },
          { key: 'direct', text: 'Direct download' },
          { key: 'browse', text: 'Browse a website' },
          { key: 'manual', text: 'Manual (please include instructions)' },
        ],
        onChangeValue: (source: IModEntry, value: any) => {
          // nop
        },
      },
    },
  ];

  private mActions: ITableRowAction[] = [
    {
      title: 'Attach Instructions',
      icon: 'edit',
      singleRowAction: true,
      action: (instanceId: string) => null,
    },
    {
      title: 'Remove',
      icon: 'delete',
      singleRowAction: true,
      multiRowAction: true,
      action: (instanceIds: string[]) => {
        instanceIds.forEach(id => {
          this.props.onRemoveRule(this.state.entries[id].rule);
          delete this.nextState.entries[id];
        });
      },
    },
  ];

  constructor(props: IProps) {
    super(props);

    this.initState({
      entries: this.generateEntries(props),
    });
  }

  public componentWillReceiveProps(newProps: IProps) {
    if ((newProps.mods !== this.props.mods)
        || (newProps.modpack !== this.props.modpack)) {
      this.nextState.entries = this.generateEntries(newProps);
    }
  }

  public render(): React.ReactNode {
    const { entries } = this.state;

    return (
      <Table
        tableId='modpack-mods'
        data={entries}
        staticElements={this.mColumns}
        actions={this.mActions}
        showDetails={false}
      />
    );
  }

  private generateEntries(props: IProps) {
    const { modpack, mods } = props;

    if ((modpack === undefined) || (modpack.rules === undefined)) {
      return {};
    }

    return Object.values(modpack.rules)
      .filter(rule => ['requires', 'recommends'].indexOf(rule.type) !== -1)
      .reduce((prev, rule) => {
        const mod = findModByRef(rule.reference, mods);
        prev[mod.id] = { rule, mod };
        return prev;
      }, {});
  }
}

export default ModsPage;
