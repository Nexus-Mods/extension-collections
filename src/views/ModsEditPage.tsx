import { ICollectionSourceInfo, SourceType } from '../types/ICollection';

import I18next from 'i18next';
import * as _ from 'lodash';
import * as React from 'react';
import { Button } from 'react-bootstrap';
import {
  ComponentEx, EmptyPlaceholder, Icon, ITableRowAction, Table, TableTextFilter,
  tooltip, types, Usage, util } from 'vortex-api';

export interface IModsPageProps {
  t: I18next.TFunction;
  collection: types.IMod;
  mods: { [modId: string]: types.IMod };
  onSetModVersion: (modId: string, version: 'exact' | 'newest') => void;
  onAddRule: (rule: types.IModRule) => void;
  onRemoveRule: (rule: types.IModRule) => void;
  onSetCollectionAttribute: (path: string[], value: any) => void;
  onAddModsDialog: (modId: string) => void;
}

interface IModEntry {
  rule: types.IModRule;
  mod: types.IMod;
}

interface IModsPageState {
  entries: { [modId: string]: IModEntry };
  problems: { [modId: string]: string[] };
}

type IProps = IModsPageProps;

const SOURCES = {
  nexus: 'Nexus Mods',
  direct: 'Direct download',
  browse: 'Browse a website',
  bundle: 'Bundle with collection',
  manual: 'Manual',
};

const INSTALL_MODES = {
  fresh: 'Fresh Install',
  choices: 'Same Installer Options',
  clone: 'Replicate',
};

class ModsEditPage extends ComponentEx<IProps, IModsPageState> {
  private mLang: string;
  private mCollator: Intl.Collator;

  private mColumns: Array<types.ITableAttribute<IModEntry>> = [
    {
      id: 'name',
      name: 'Mod Name',
      description: 'Mod Name',
      calc: (entry: IModEntry) => (entry.mod !== undefined)
        ? util.renderModName(entry.mod)
        : util.renderModReference(entry.rule.reference),
      placement: 'table',
      edit: {},
      isDefaultSort: true,
      isSortable: true,
      filter: new TableTextFilter(true),
      sortFunc: (lhs: string, rhs: string, locale: string): number => {
        if ((this.mCollator === undefined) || (locale !== this.mLang)) {
          this.mLang = locale;
          this.mCollator = new Intl.Collator(locale, { sensitivity: 'base' });
        }
        return this.mCollator.compare(lhs, rhs);
      },
    }, {
      id: 'highlight',
      name: 'Tag',
      description: 'Mod Highlights',
      customRenderer: (entry: IModEntry) => {
        if (entry.mod === undefined) {
          return (
            <tooltip.Icon
              name='feedback-error'
              tooltip={this.props.t('This mod isn\'t installed.')}
            />
          );
        }

        const color = util.getSafe(entry.mod.attributes, ['color'], '');
        const icon = util.getSafe(entry.mod.attributes, ['icon'], '');
        const hasProblem = (this.state.problems[entry.mod.id] !== undefined)
                        && (this.state.problems[entry.mod.id].length > 0);
        const hasHighlight = color || icon;

        if (!color && !icon  && !hasProblem) {
          return null;
        }
        return (
          <>
            {hasHighlight ? (
              <Icon
                className={'highlight-base ' + (color !== '' ? color : 'highlight-default')}
                name={icon !== '' ? icon : 'highlight'}
              />
            ) : null}
            {hasProblem ? (
              <tooltip.Icon
                name='incompatible'
                tooltip={this.state.problems[entry.mod.id].join('\n')}
              />
            ) : null}
          </>
        );
      },
      calc: (entry: IModEntry) => {
        if (entry.mod === undefined) {
          return 'not-installed';
        }
        const color = util.getSafe(entry.mod.attributes, ['color'], '');
        const icon = util.getSafe(entry.mod.attributes, ['icon'], '');
        const problems = this.state.problems[entry.mod.id] || [];

        return `${color} - ${icon} - ${problems.join(',')}`;
      },
      placement: 'table',
      edit: {},
    }, {
      id: 'required',
      name: 'Required',
      description: 'Whether the entire collection will fail if this mod is missing',
      calc: (mod: IModEntry) => {
        return mod.rule.type === 'requires'
          ? true
          : false;
      },
      placement: 'table',
      edit: {
        inline: true,
        actions: false,
        choices: () => [
          { key: 'required', bool: true } as any,
          { key: 'optional', bool: false } as any,
        ],
        onChangeValue: (source: IModEntry, value: any) => {
          this.props.onRemoveRule(source.rule);
          const newRule = _.cloneDeep(source.rule);
          newRule.type = value ? 'requires' : 'recommends';
          this.props.onAddRule(newRule);
        },
      },
    }, {
      id: 'source',
      name: 'Source',
      description: 'How the user acquires the mod',
      calc: (entry: IModEntry) => {
        const id = entry.mod?.id ?? entry.rule?.reference?.id;
        const { collection } = this.props;
        const type = util.getSafe(collection,
                                  ['attributes', 'collection', 'source', id, 'type'],
                                  'nexus');
        return SOURCES[type];
      },
      placement: 'table',
      edit: {
        inline: true,
        actions: false,
        choices: () => Object.keys(SOURCES).map(key => ({ key, text: SOURCES[key] })),
        onChangeValue: (entry: IModEntry, value: any) => {
          const id = entry.mod?.id ?? entry.rule?.reference?.id;
          if (id !== undefined) {
            this.querySource(id, value);
          }
        },
      },
    }, {
      id: 'edit-source',
      placement: 'table',
      edit: {},
      calc: (entry: IModEntry) => {
        const { collection } = this.props;
        const id = entry.mod?.id ?? entry.rule?.reference?.id;

        const type = util.getSafe(collection,
                                  ['attributes', 'collection', 'source', id, 'type'],
                                  'nexus');
        return SOURCES[type];
      },
      customRenderer: (entry: IModEntry) => {
        const { t, collection } = this.props;
        const id = entry.mod?.id ?? entry.rule?.reference?.id;
        const type = util.getSafe(collection,
                                  ['attributes', 'collection', 'source', id, 'type'],
                                  'nexus');
        return (
          <tooltip.IconButton
            icon='edit'
            disabled={(entry.mod === undefined) || ['nexus', 'bundle'].includes(type)}
            tooltip={t('Edit Source')}
            data-modid={id}
            onClick={this.onQuerySource}
          />
        );
      },
    }, {
      id: 'version-match',
      name: 'Version',
      description: 'The version to install',
      calc: (entry: IModEntry) => {
        const { collection } = this.props;
        const { t } = this.props;
        const id = entry.mod?.id ?? entry.rule?.reference?.id;
        const version = entry.mod?.attributes?.['version'] ?? t('N/A');

        if (collection.attributes?.collection?.source?.[id]?.type === 'bundle') {
          return t('Current ({{version}})', { replace: { version } });
        }

        if (entry.rule.reference.versionMatch === '*') {
          return t('Latest');
        } else if ((entry.rule.reference.versionMatch || '').endsWith('+prefer')) {
          return t('Prefer current ({{version}})', { replace: { version } });
        } else {
          return t('Current ({{version}})', { replace: { version } });
        }
      },
      placement: 'table',
      edit: {
        inline: true,
        actions: false,
        choices: (entry: IModEntry) => {
          const { t, collection } = this.props;
          const id = entry.mod?.id ?? entry.rule?.reference?.id;
          const version = entry.mod?.attributes?.['version'] ?? t('N/A');

          if (collection.attributes?.collection?.source?.[id]?.type === 'bundle') {
            return [
              { key: 'exact', text: t('Current ({{version}})', { replace: { version } }) },
            ];
          }

          return [
            { key: 'exact', text: t('Current ({{version}})', { replace: { version } }) },
            { key: 'prefer', text: t('Prefer current ({{version}})', { replace: { version } }) },
            { key: 'newest', text: t('Latest') },
          ];
        },
        onChangeValue: (entry: IModEntry, value: any) => {
          if (entry.mod === undefined) {
            return;
          }

          this.props.onRemoveRule(entry.rule);
          const newRule = _.cloneDeep(entry.rule);
          newRule.reference.versionMatch = (value === 'exact')
            ? entry.mod.attributes['version']
            : (value === 'prefer')
            ? '>=' + entry.mod.attributes['version'] + '+prefer'
            : '*';
          this.props.onAddRule(newRule);
        },
      },
    }, {
      id: 'install-type',
      name: 'Install',
      description: 'How the mod should be installed on the user system',
      calc: (entry: IModEntry) => {
        const { collection } = this.props;
        const id = entry.mod?.id ?? entry.rule?.reference?.id;

        if (collection.attributes?.collection?.source?.[id]?.type === 'bundle') {
          return INSTALL_MODES['clone'];
        }

        const installMode =
          util.getSafe(collection, ['attributes', 'collection', 'installMode', id], 'fresh');
        return INSTALL_MODES[installMode];
      },
      placement: 'table',
      help: 'If set to "Fresh Install" the mod will simply be installed fresh on the users system, '
          + 'installer (if applicable) and everything.\n'
          + 'If set to "Replicate" Vortex will try to replicate your exact setup for this mod. '
          + 'This does not bundle the mod itself but the list of files to install and patches if '
          + 'necessary. This may increase the size of the collection and the time it takes to '
          + 'export it considerably.',
      edit: {
        inline: true,
        actions: false,
        choices: (entry: IModEntry) => {
          const { collection } = this.props;
          const id = entry.mod?.id ?? entry.rule?.reference?.id;

          if (collection.attributes?.collection?.source?.[id]?.type === 'bundle') {
            return [{ key: 'clone', text: INSTALL_MODES['clone'] }];
          }

          return Object.keys(INSTALL_MODES).map(key => ({ key, text: INSTALL_MODES[key] }));
        },
        onChangeValue: (entry: IModEntry, value: any) => {
          const id = entry.mod?.id ?? entry.rule?.reference?.id;
          if (id !== undefined) {
            this.props.onSetCollectionAttribute(['installMode', id], value);
          }
        },
      },
    }, {
      id: 'instructions',
      name: 'Instructions',
      icon: 'edit',
      calc: (entry: IModEntry) => {
        const { collection } = this.props;

        if (entry.mod === undefined) {
          return null;
        }

        return collection.attributes?.collection?.instructions?.[entry.mod.id];
      },
      customRenderer: (entry: IModEntry, detailCell: boolean, t: types.TFunction) => {
        const { collection } = this.props;

        if (entry.mod === undefined) {
          return null;
        }

        const instructions = collection.attributes?.collection?.instructions?.[entry.mod.id];
        return (instructions ?? '').length > 0 ? (
          <tooltip.IconButton
            icon='edit'
            tooltip={t('Edit Instructions')}
            data-modid={entry.mod.id}
            onClick={this.changeInstructions}
          >
            {t('Edit')}
          </tooltip.IconButton>
        ) : (
          <tooltip.IconButton
            icon='add'
            tooltip={t('Add Instructions')}
            data-modid={entry.mod.id}
            onClick={this.changeInstructions}
          >
            {t('Add')}
          </tooltip.IconButton>
        );
      },
      placement: 'table',
      edit: {},
    },
  ];

  private mActions: ITableRowAction[] = [
    {
      title: 'Requires',
      icon: 'requires',
      singleRowAction: false,
      multiRowAction: true,
      condition: (instanceIds: string[]) =>
        instanceIds.find(id => this.state.entries[id]?.rule?.type === 'recommends') !== undefined,
      action: (instanceIds: string[]) => {
        const { onAddRule, onRemoveRule } = this.props;
        const { entries } = this.state;
        instanceIds.forEach(id => {
          if (entries[id]?.rule?.type === 'recommends') {
            const newRule = _.cloneDeep(entries[id].rule);
            onRemoveRule(entries[id].rule);
            newRule.type = 'requires';
            onAddRule(newRule);
          }
        });
      },
    },
    {
      title: 'Recommends',
      icon: 'recommends',
      singleRowAction: false,
      multiRowAction: true,
      condition: (instanceIds: string[]) =>
        instanceIds.find(id => this.state.entries[id]?.rule?.type === 'requires') !== undefined,
      action: (instanceIds: string[]) => {
        const { onAddRule, onRemoveRule } = this.props;
        const { entries } = this.state;
        instanceIds.forEach(id => {
          if (entries[id].rule?.type === 'requires') {
            const newRule = _.cloneDeep(entries[id].rule);
            onRemoveRule(entries[id].rule);
            newRule.type = 'recommends';
            onAddRule(newRule);
          }
        });
      },
    },
    {
      title: 'Set Install Type',
      icon: 'edit',
      singleRowAction: false,
      multiRowAction: true,
      action: (instanceIds: string[]) => {
        const { onSetCollectionAttribute, collection } = this.props;

        const refMode = collection.attributes?.collection?.installMode?.[instanceIds[0]] ?? 'fresh';

        this.context.api.showDialog('question', 'Install Type', {
          text: 'Please select the install mode to apply to all selected mods',
          choices: [
            { id: 'fresh', text: 'Fresh Install', value: refMode === 'fresh' },
            { id: 'choices', text: 'Same Installer Options', value: refMode === 'choices' },
            { id: 'clone', text: 'Replicate', value: refMode === 'clone' },
          ],
        }, [
          { label: 'Cancel' },
          { label: 'Apply' },
        ]).then(result => {
          if (result.action === 'Apply') {
            const selected = Object.keys(result.input).find(iter => result.input[iter]);
            instanceIds.forEach(modId => {
              onSetCollectionAttribute(['installMode', modId], selected);
            });
          }
        });
      },
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

    const entries = this.generateEntries(props);
    this.initState({
      entries,
      problems: this.checkProblems(props, entries),
    });
  }

  public componentWillMount() {
    const entries = this.generateEntries(this.props);
    this.nextState.entries = entries;
    this.nextState.problems = this.checkProblems(this.props, entries);
  }

  public UNSAFE_componentWillReceiveProps(newProps: IProps) {
    if ((newProps.mods !== this.props.mods)
        || (newProps.collection !== this.props.collection)) {
      const entries = this.generateEntries(newProps);
      this.nextState.entries = entries;
      this.nextState.problems = this.checkProblems(newProps, entries);
    }
  }

  public render(): React.ReactNode {
    const { t } = this.props;
    const { entries } = this.state;

    const addModsButton = () => {
      return (<Button
        id='btn-more-mods'
        className='collection-add-mods-btn'
        onClick={this.addMods}
        bsStyle='ghost'
      >
        <Icon name='add' />
        {t('Add more mods')}
      </Button>);
    };

    if (Object.keys(entries).length === 0) {
      return (
        <EmptyPlaceholder
          icon='layout-list'
          text={t('There are no mods in this collection')}
          // subtext={t('Is it a collection when there\'s nothing in it?')}
          subtext={addModsButton()}
          fill={true}
        />
      );
    }

    return (
      <div className='collection-mods-container'>
        <Table
          tableId='collection-mods'
          data={entries}
          staticElements={this.mColumns}
          actions={this.mActions}
          showDetails={false}
        >
          <div id='collection-add-mods-container'>
            {addModsButton()}
          </div>
        </Table>
        <Usage infoId='collection-mods'>
          <p>{t('Here you can configure which mods to install and how.')}</p>
          <p>{t('Version: Choose whether the collection will install exactly the version you '
            + 'have yourself or whatever is current on Nexus Mods.')}</p>
          <p>{t('Required: Select whether the user has to install the mod or whether it\'s just '
            + 'a recommendation.')}</p>
          <p>{t('Install: "Fresh Install" will install the mod as Vortex would usually do, '
            + 'installer dialog and everything. "Replicate" will extract only the files you have '
            + 'extracted yourself, in exactly the same location. This basically ensures the user '
            + 'gets the same options as you without having to pick them but it only works when you '
            + 'have selected "Exact version" in the Version column. It will also considerably '
            + 'increase the time it takes to build the pack.')}</p>
          <p>{t('Source: Decides how the user downloads the mod. "Nexus Mods" is easiest, use the '
            + 'other options when the mod in only hosted on a different source. '
            + 'The options also include "pack" which bundles the mod directly into the collection. '
            + 'Do this only for stuff created during setup (e.g. generated LODs, '
            + 'customized configuration files and such). '
            + 'You must not include any material you don\'t hold the copyright to. '
            + 'Also: Do not provide direct download links unless you have express permission to '
            + 'do so.')}
          </p>
        </Usage>
      </div>
    );
  }

  private addMods = () =>  {
    const { collection, onAddModsDialog } = this.props;
    onAddModsDialog(collection.id);
  }

  private generateEntries(props: IProps) {
    const { collection, mods } = props;

    if ((collection === undefined) || (collection.rules === undefined)) {
      return {};
    }

    return Object.values(collection.rules)
      .filter(rule => ['requires', 'recommends'].indexOf(rule.type) !== -1)
      .reduce((prev, rule) => {
        const mod = util.findModByRef(rule.reference, mods);
        const id = mod?.id ?? rule.reference.id;
        if (id !== undefined) {
          prev[id] = { rule, mod };
        }
        return prev;
      }, {});
  }

  private checkProblems(props: IProps,
                        entries: { [modId: string]: IModEntry })
                        : { [modId: string]: string[] } {
    return Object.values(entries).reduce((prev, entry) => {
      const id = entry.mod?.id ?? entry.rule.reference.id;
      if (id !== undefined) {
        prev[id] = this.updateProblems(props, entry);
      }
      return prev;
    }, {});
  }

  private updateProblems(props: IProps, entry: IModEntry): string[] {
    const { t, collection } = props;

    if (entry.mod === undefined) {
      return;
    }

    const res: string[] = [];

    const source: string =
      collection.attributes?.collection?.source?.[entry.mod.id]?.type ?? 'nexus';
    const installMode: string =
      collection?.attributes?.collection?.installMode?.[entry.mod.id] ?? 'fresh';

    if ((source === 'nexus')
        && (isNaN(parseInt(entry.mod.attributes?.modId, 10))
            || isNaN(parseInt(entry.mod.attributes?.fileId, 10)))) {
      res.push(t('When using nexus as a source both the mod id and file id have to be known. '
                + 'If you didn\'t download the mod through Vortex they will not be set. '
                + 'To solve this you have to change the source of the mod to "Nexus", '
                + 'click "Guess id" (which will determine the mod id) and finally '
                + 'check mods for updates which should fill in the file id.'));
    }

    if (entry.rule.reference.versionMatch === '*') {
      if (installMode === 'clone') {
        res.push(t('"Replicate" install can only be used when installing '
                  + 'a specific version of a mod. This will definitively break '
                  + 'as soon as the mod gets updated.'));
      } else if (installMode === 'choices') {
        res.push(t('Installing with "Same choices options" may break if the mod gets updated, '
                 + 'you may want to switch to "Exactly this version" to be safe.'));
      }
    }

    if (source === 'bundle') {
      res.push(t('Mods are copyright protected, only pack mods if you are sure you '
               + 'have the right to do so, e.g. if it\'s dynamically generated content '
               + 'or if it\'s your own mod.'));
    } else if (source === 'direct') {
      res.push(t('Most websites don\'t allow direct downloads, Plese make sure you are '
               + 'allowed to use direct links to the specified page.'));
    }

    if ((installMode === 'choices')
        && (util.getSafe(entry.mod, ['attributes', 'installerChoices'], undefined) === undefined)) {
      res.push(t('The installer choices for this mod haven\'t been saved. '
               + 'This currently only works with xml-based fomods installed with '
               + 'Vortex 1.1.0 or later. '
               + 'You may have to reinstall the mod for this to work.'));
    }

    if (entry.rule.reference.versionMatch === '') {
      res.push(t('The mod has no version number set. This isn\'t strictly necessary, we use the '
               + 'file id to identify the exact version but for the purpose of informing the '
               + 'user it would be nicer if a version was specified. '
               + '(Please don\'t forget to update the collection)'));
    }

    return res;
  }

  private querySource(modId: string, type: SourceType) {
    const { collection } = this.props;
    const src: ICollectionSourceInfo = util.getSafe(collection,
      ['attributes', 'collection', 'source', modId], { type });
    const input: types.IInput[] = [];

    /*
    if ((type === 'bundle')
        && (mods[modId].attributes?.source !== undefined)) {
      return this.context.api.showDialog('error', 'Can\'t bundle foreign content', {
        text: 'This mod has been downloaded from a website so we assume '
            + 'it was created by someone else.\n'
            + 'Redistributing this could therefore '
            + 'be copyright infringement and is therefore not allowed. '
            + 'You can only bundle mods that you created yourself, locally.\n'
            + 'Please respect mod authors and understand that they have rights, even '
            + 'if that is sometimes inconvenient.'
      }, [
        { label: 'Understood' },
      ]);
    }
    */

    if (['direct', 'browse'].includes(type)) {
      input.push({ id: 'url', type: 'url', label: 'URL', value: src.url });
    }

    if (['browse', 'manual'].includes(type)) {
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
        this.props.onSetCollectionAttribute(['source', modId], {
          type,
          url: result.input.url,
          instructions: result.input.instructions,
        });
      }));
    } else {
      this.props.onSetCollectionAttribute(['source', modId], { type });
    }
  }

  private changeInstructions = (evt: React.MouseEvent<any>) => {
    const { collection, onSetCollectionAttribute } = this.props;
    const modId = evt.currentTarget.getAttribute('data-modid');

    const value = collection.attributes?.collection?.instructions?.[modId] ?? '';

    this.context.api.showDialog('info', 'Instructions', {
      text: 'These instructions will be shown before installing the mod. '
          + 'This will interrupt the installation process so please use it '
          + 'only if you have to',
      input: [ { label: 'Instructions', id: 'instructions', type: 'textarea' as any, value } ],
    }, [
      { label: 'Cancel' },
      { label: 'Save' },
    ], 'collection-set-instructions')
    .then(result => {
      if (result.action === 'Save') {
        onSetCollectionAttribute(['instructions', modId], result.input['instructions']);
      }
    });
  }

  private onQuerySource = (evt: React.MouseEvent<any>) => {
    const { collection } = this.props;
    const modId = evt.currentTarget.getAttribute('data-modid');
    const type = collection.attributes?.collection?.source?.[modId]?.type ?? 'nexus';

    return this.querySource(modId, type);
  }
}

export default ModsEditPage;
