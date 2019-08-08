import { TranslationFunction } from 'i18next';
import * as React from 'react';
import { ComponentEx, ITableRowAction, Table, types, util } from 'vortex-api';
import { IModPackMod } from '../types/IModPack';

export interface IModsPageProps {
  t: TranslationFunction;
  profile: types.IProfile;
  mods: { [modId: string]: types.IMod };
  onSetModVersion: (modId: string, version: 'exact' | 'newest') => void;
}

interface IModsPageState {
}

type IProps = IModsPageProps;

class ModsPage extends ComponentEx<IProps, IModsPageState> {
  private mColumns: Array<types.ITableAttribute<types.IMod>> = [
    {
      id: 'name',
      name: 'Mod Name',
      description: 'Mod Name',
      calc: (mod: types.IMod) => util.renderModName(mod),
      placement: 'table',
      edit: {},
    }, {
      id: 'version',
      name: 'Version',
      description: 'The version to install',
      calc: (mod: types.IMod) => {
        return 'Exactly this version';
      },
      placement: 'table',
      edit: {
        inline: true,
        actions: false,
        choices: () => [
          { key: 'exact', text: 'Exactly this version' },
          { key: 'newest', text: 'Latest available update' }],
        onChangeValue: (source: types.IMod, value: any) => {
          // nop
        },
      },
    }, {
      id: 'required',
      name: 'Required',
      description: 'Whether the entire mod pack will fail if this mod is missingü',
      calc: (mod: types.IMod) => {
        return 'Required';
      },
      placement: 'table',
      edit: {
        inline: true,
        actions: false,
        choices: () => [
          { key: 'required', text: 'Required' },
          { key: 'optional', text: 'Optional' },
          { key: 'exclude', text: 'Don\'t include' },
        ],
        onChangeValue: (source: types.IMod, value: any) => {
          // nop
        },
      },
    }, {
      id: 'source',
      name: 'Source',
      description: 'How the user gets the mod',
      calc: (mod: types.IMod) => {
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
        onChangeValue: (source: types.IMod, value: any) => {
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
  ];

  constructor(props: IProps) {
    super(props);

    this.initState({
    });
  }

  public componentWillReceiveProps(newProps: IProps) {
    if (newProps.mods !== this.props.mods) {
      // nop
    }
  }

  public render(): React.ReactNode {
    const { profile, mods } = this.props;

    const includedMods = Object.keys(mods)
      .filter(modId => util.getSafe(profile, ['modState', modId, 'enabled'], false))
      .reduce((prev, modId) => {
        prev[modId] = mods[modId];
        return prev;
      }, {});

    return (
      <Table
        tableId='modpack-mods'
        data={includedMods}
        staticElements={this.mColumns}
        actions={this.mActions}
        showDetails={false}
      />
    );
  }
}

export default ModsPage;
