import findModByRef from '../util/findModByRef';

import { TranslationFunction } from 'i18next';
import * as _ from 'lodash';
import * as React from 'react';
import { ComponentEx, Icon, ITableRowAction, Table, types, Usage, util } from 'vortex-api';
import { IModPackSourceInfo } from '../types/IModPack';

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

const SOURCES = {
  nexus: 'Nexus Mods',
  direct: 'Direct download',
  browse: 'Browse a website',
  pack: 'Bundle with modpack',
  manual: 'Manual',
};

class ModsPage extends ComponentEx<IProps, IModsPageState> {
  private mLang: string;
  private mCollator: Intl.Collator;

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
      sortFunc: (lhs: string, rhs: string, locale: string): number => {
        if ((this.mCollator === undefined) || (locale !== this.mLang)) {
          this.mLang = locale;
          this.mCollator = new Intl.Collator(locale, { sensitivity: 'base' });
        }
        return this.mCollator.compare(lhs, rhs);
      },
    }, {
      id: 'highlight',
      name: '',
      description: 'Mod Highlights',
      customRenderer: (mod: IModEntry) => {
        const color = util.getSafe(mod.mod.attributes, ['color'], '');
        const icon = util.getSafe(mod.mod.attributes, ['icon'], '');
        if (!color && !icon) {
          return null;
        }
        return (
          <Icon
            className={'highlight-base ' + (color !== '' ? color : 'highlight-default')}
            name={icon !== '' ? icon : 'highlight'}
          />);
      },
      calc: (mod: IModEntry) => {
        const color = util.getSafe(mod.mod.attributes, ['color'], '');
        const icon = util.getSafe(mod.mod.attributes, ['icon'], '');

        return `${color} - ${icon}`;
      },
      placement: 'table',
      edit: {},
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
        },
      },
    }, {
      id: 'source',
      name: 'Source',
      description: 'How the user acquires the mod',
      calc: (entry: IModEntry) => {
        const { modpack } = this.props;
        const type = util.getSafe(modpack,
                                  ['attributes', 'modpack', 'source', entry.mod.id, 'type'],
                                  'nexus');
        return SOURCES[type];
      },
      placement: 'table',
      edit: {
        inline: true,
        actions: false,
        choices: () => Object.keys(SOURCES).map(key => ({ key, text: SOURCES[key] })),
        onChangeValue: (entry: IModEntry, value: any) => {
          const { modpack } = this.props;
          const src: IModPackSourceInfo = util.getSafe(modpack,
            ['attributes', 'modpack', 'source', entry.mod.id], { type: value });
          const input: types.IInput[] = [];

          if (['direct', 'browse'].indexOf(value) !== -1) {
            input.push({ id: 'url', type: 'url', label: 'URL', value: src.url });
          }

          if (['browse', 'manual'].indexOf(value) !== -1) {
            input.push({
              id: 'instructions', type: 'text', label: 'Instructions',
              value: src.instructions,
            });
          }

          if (input.length > 0) {
            // query details for direct/browse/manual
            this.context.api.showDialog('question',
              'Please provide information the user needs to find the mod', {
              input,
            }, [
              { label: 'Save' },
            ]).then((result => {
              this.props.onSetModpackAttribute(['source', entry.mod.id], {
                type: value,
                url: result.input.url,
                instructions: result.input.instructions,
              });
            }));
          } else {
            this.props.onSetModpackAttribute(['source', entry.mod.id], { id: value });
          }
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
    const { t } = this.props;
    const { entries } = this.state;

    return (
      <div className='modpack-mods-container'>
      <Table
        tableId='modpack-mods'
        data={entries}
        staticElements={this.mColumns}
        actions={this.mActions}
        showDetails={false}
      />
      <Usage infoId='modpack-mods'>
        <p>{t('Here you can configure which mods to install and how.')}</p>
        <p>{t('Version: Choose whether the modpack will install exactly the version you '
           + 'have yourself or whatever is current on Nexus Mods.')}</p>
        <p>{t('Required: Select whether the user has to install the mod or whether it\'s just '
           + 'a recommendation.')}</p>
        <p>{t('Install: "Fresh Install" will install the mod as Vortex would usually do, installer '
           + 'dialog and everything. "Replicate" will extract only the files you have extracted '
           + 'yourself, in exactly the same location. This basically ensures the user gets the '
           + 'same options as you without having to pick them but it only works when you have '
           + 'selected "Exact version" in the Version column. It will also considerably increase '
           + 'the time it takes to build the pack.')}</p>
        <p>{t('Source: Decides how the user downloads the mod. "Nexus Mods" is easiest, use the '
           + 'other options when the mod in only hosted on a different source. '
           + 'The options also include "pack" which bundles the mod directly into the mod pack. '
           + 'Do this only for stuff created during setup (e.g. generated LODs, '
           + 'customized configuration files and such). '
           + 'You must not include any material you don\'t hold the copyright to. '
           + 'Also Do not provide direct download links unless you have express permission to '
           + 'do so.')}
         </p>
      </Usage>
      </div>
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
        if (mod !== undefined) {
          prev[mod.id] = { rule, mod };
        }
        return prev;
      }, {});
  }
}

export default ModsPage;
