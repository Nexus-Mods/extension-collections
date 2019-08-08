import * as Promise from 'bluebird';
import * as path from 'path';
import * as React from 'react';
import { Button, ControlLabel, ListGroup, ListGroupItem } from 'react-bootstrap';
import { withTranslation } from 'react-i18next';
import { connect } from 'react-redux';
import * as Redux from 'redux';
import { ThunkDispatch } from 'redux-thunk';
import { actions, ComponentEx, fs, PureComponentEx, selectors,
         Toggle, types, util } from 'vortex-api';

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
    const { enabled, fileName } = this.props;
    const match = fileName.match(/(.*)\[(.*)\]\.ini/);

    if (!match || (match.length < 2)) {
      return null;
    }

    return (
      <ListGroupItem className='listitem-tweak'>
        <Toggle checked={enabled} onToggle={this.toggle}>{match[1]}</Toggle>
      </ListGroupItem>
    );
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
    const { mod, modsPath } = this.props;

    if ((mod !== undefined) && (mod.installationPath !== undefined)) {
      fs.readdirAsync(path.join(modsPath, mod.installationPath, INI_TWEAKS_PATH))
        .then((files: string[]) => {
          this.nextState.tweaks = files;
        })
        .catch(() => undefined);
    }
  }

  public render(): JSX.Element {
    const { t } = this.props;
    const { tweaks } = this.state;

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
        <ListGroup>
          {tweaks.map(this.renderTweak)}
        </ListGroup>
        <Button onClick={this.addIniTweak}>
          {t('Add')}
        </Button>
      </div>
    );
  }

  private addIniTweak = () => {
    const { mod, modsPath } = this.props;
    this.context.api.showDialog('question', 'Name', {
      text: 'Please enter a name for the ini tweak',
      input: [
        { id: 'name', type: 'text' },
      ],
      condition: validateFilenameInput,
    }, [
      { label: 'Cancel' },
      { label: 'Confirm' },
    ]).then(res => {
      if (res.action === 'Confirm') {
        const tweaksPath = path.join(modsPath, mod.installationPath, INI_TWEAKS_PATH);
        return fs.ensureDirWritableAsync(tweaksPath, () => Promise.resolve())
          .then(() => fs.writeFileAsync(path.join(tweaksPath, res.input['name'] + '.ini'), ''));
      } else {
        return Promise.resolve();
      }
    });
  }

  private renderTweak = (fileName: string): JSX.Element => {
    const { mod } = this.props;
    const isEnabled = util.getSafe(mod, ['enabledINITweaks'], []).indexOf(fileName) !== -1;
    return (
      <Tweak
        key={`tweak-${fileName}`}
        fileName={fileName}
        enabled={isEnabled}
        onToggle={this.toggle}
      />);
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

const TweakListConnected = withTranslation(['common'])(
  connect(mapStateToProps, mapDispatchToProps)(
    TweakList) as any) as React.ComponentClass<IBaseProps>;

export default TweakListConnected;
