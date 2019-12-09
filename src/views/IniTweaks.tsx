import { NAMESPACE } from '../constants';
import { getIniFiles } from '../util/gameSupport';

import * as Promise from 'bluebird';
import I18next from 'i18next';
import * as path from 'path';
import * as React from 'react';
import { Button, ControlLabel, Table } from 'react-bootstrap';
import { withTranslation } from 'react-i18next';
import { connect } from 'react-redux';
import Select from 'react-select';
import * as Redux from 'redux';
import { ThunkDispatch } from 'redux-thunk';
import { actions, ComponentEx, fs, PureComponentEx, selectors,
         Toggle, types, util, Icon } from 'vortex-api';

// copy&paste from src/extensions/mod_management/InstallManager.ts
const INI_TWEAKS_PATH = 'Ini Tweaks';

interface IBaseProps {
  modId: string;
}

interface IConnectedProps {
  gameMode: string;
  modsPath: string;
  mod: types.IMod;
}

interface IActionProps {
  onSetINITweakEnabled: (gameId: string, modId: string, tweak: string, enabled: boolean) => void;
}

type IProps = IBaseProps & IConnectedProps & IActionProps;

interface IComponentState {
  tweaks: string[];
}

interface ITweakProps {
  t: I18next.TFunction;
  tweaksPath: string;
  fileName: string;
  enabled: boolean;
  onToggle: (fileName: string, enabled: boolean) => void;
}

function validateFilenameInput(content: types.IDialogContent): types.IConditionResult[] {
  const input = content.input[0].value || '';
  if ((input.length < 2) || !(util as any).isFilenameValid(input)) {
    return [{
      actions: ['Confirm'],
      errorText: 'Has to be a valid file name',
      id: content.input[0].id,
    }];
  } else {
    return [];
  }
}

class Tweak extends PureComponentEx<ITweakProps, {}> {
  public render(): JSX.Element {
    const { t, enabled, fileName } = this.props;
    const match = fileName.match(/(.*)\[(.*)\]\.ini/);

    if (!match || (match.length < 2)) {
      return null;
    }

    const options = [
      { label: t('Required'), value: 'required' },
      { label: t('Recommended'), value: 'recommended' },
      { label: t('Optional'), value: 'optional' },
    ];

    return (
      <tr>
        <td className='cell-status'><Toggle checked={enabled} onToggle={this.toggle}/></td>
        <td className='cell-filename'>{match[1]}</td>
        <td className='cell-requirement'>
          <Select
            options={options}
            value='Optional'
          />
        </td>
        <td className='cell-edit'><a onClick={this.edit}><Icon name='edit' /></a></td>
      </tr>
    );
  }

  private edit = () => {
    const { tweaksPath, fileName } = this.props;
    util.opn(path.join(tweaksPath, fileName)).catch(() => null);
  }

  private toggle = (enabled: boolean) => {
    const { fileName, onToggle } = this.props;
    onToggle(fileName, enabled);
  }
}

class TweakList extends ComponentEx<IProps, IComponentState> {
  constructor(props: IProps) {
    super(props);

    this.initState({
      tweaks: [],
    });
  }

  public componentWillMount() {
    this.refreshTweaks();
  }

  public render(): JSX.Element {
    const { t, mod } = this.props;
    const { tweaks } = this.state;

    if (mod === undefined) {
      return null;
    }

    return (
      <div>
        <ControlLabel>
          <p>
            {t('This screen lets you set up tweaks for the game ini file that will be applied '
              + 'to a user\'s setup when they use your mod pack.')}
          </p>
          <p>
            {t('Users can toggle these ini tweaks individually so may want to set up '
              + 'multiple tweaks to give users granular control.')}
          </p>
        </ControlLabel>
        <Table id='collection-initweaks-table'>
          <thead>
            <tr>
              <th className='header-status'>{t('Status')}</th>
              <th className='header-filename'>{t('Ini file')}</th>
              <th className='header-requirement'>{t('Requirement')}</th>
              <th className='header-edit'>{t('Edit')}</th>
            </tr>
          </thead>
          <tbody>
            {tweaks.map(this.renderTweak)}
          </tbody>
        </Table>
        <Button onClick={this.addIniTweak}>
          {t('Add')}
        </Button>
      </div>
    );
  }

  private addIniTweak = () => {
    const { gameMode, mod, modsPath } = this.props;
    const files = getIniFiles(gameMode);
    this.context.api.showDialog('question', 'Name', {
      text: 'Please enter a name for the ini tweak',
      input: [
        { id: 'name', type: 'text' },
      ],
      choices: files.map((fileName, idx) => ({
        text: fileName,
        value: idx === 0,
        id: fileName,
      })),
      condition: validateFilenameInput,
    }, [
      { label: 'Cancel' },
      { label: 'Confirm' },
    ]).then(res => {
      if (res.action === 'Confirm') {
        const tweaksPath = path.join(modsPath, mod.installationPath, INI_TWEAKS_PATH);
        let selectedIni = Object.keys(res.input)
          .find(key => (path.extname(key) === '.ini') && res.input[key] === true);
        if (selectedIni === undefined) {
          // shouldn't be possible since it's radiobuttons and one is preset so
          // one should always be selected.
          return Promise.reject(new Error('No ini file selected'));
        }
        selectedIni = path.basename(selectedIni, path.extname(selectedIni));
        const fileName = `${res.input['name']} [${selectedIni}].ini`;
        return fs.ensureDirWritableAsync(tweaksPath, () => Promise.resolve())
          .then(() => fs.writeFileAsync(path.join(tweaksPath, fileName), ''))
          .then(() => this.refreshTweaks());
      } else {
        return Promise.resolve();
      }
    });
  }

  private renderTweak = (fileName: string): JSX.Element => {
    const { t, mod, modsPath } = this.props;
    const isEnabled = util.getSafe(mod, ['enabledINITweaks'], []).indexOf(fileName) !== -1;
    return (
      <Tweak
        t={t}
        key={`tweak-${fileName}`}
        tweaksPath={path.join(modsPath, mod.installationPath, INI_TWEAKS_PATH)}
        fileName={fileName}
        enabled={isEnabled}
        onToggle={this.toggle}
      />);
  }

  private refreshTweaks = () => {
    const { mod, modsPath } = this.props;

    if ((mod !== undefined) && (mod.installationPath !== undefined)) {
      fs.readdirAsync(path.join(modsPath, mod.installationPath, INI_TWEAKS_PATH))
        .then((files: string[]) => {
          this.nextState.tweaks = files;
        })
        .catch(() => undefined);
    }
  }

  private toggle = (fileName: string, enabled: boolean) => {
    const { gameMode, mod, onSetINITweakEnabled } = this.props;
    onSetINITweakEnabled(gameMode, mod.id, fileName, enabled);
  }
}

function mapStateToProps(state: types.IState, ownProps: IBaseProps): IConnectedProps {
  const gameMode = selectors.activeGameId(state);
  return {
    gameMode,
    modsPath: selectors.installPath(state),
    mod: util.getSafe(state, ['persistent', 'mods', gameMode, ownProps.modId], undefined),
  };
}

function mapDispatchToProps(dispatch: ThunkDispatch<types.IState, null, Redux.Action>)
    : IActionProps {
  return {
    onSetINITweakEnabled:
    (gameId: string, modId: string, tweak: string, enabled: boolean) => {
      dispatch(actions.setINITweakEnabled(gameId, modId, tweak, enabled));
    },
  };
}

const TweakListConnected = withTranslation(['common', NAMESPACE])(
  connect(mapStateToProps, mapDispatchToProps)(
    TweakList) as any) as React.ComponentClass<IBaseProps>;

export default TweakListConnected;
