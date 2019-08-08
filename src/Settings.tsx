import * as Promise from 'bluebird';
import * as path from 'path';
import * as React from 'react';
import { Alert, Button, ControlLabel, FormControl, FormGroup, InputGroup } from 'react-bootstrap';
import { translate } from 'react-i18next';
import { connect } from 'react-redux';
import * as Redux from 'redux';
import { actions, ComponentEx } from 'vortex-api';

export interface ISettingsProps {
  getKnownLanguages: () => Promise<string>;
  onCreateLanguage: (languageCode: string) => Promise<void>;
}

interface IConnectedProps {

}

interface IActionProps {
}

interface IComponentState {
}

type IProps = ISettingsProps & IConnectedProps & IActionProps;

class Settings extends ComponentEx<IProps, IComponentState> {
  constructor(props: IProps) {
    super(props);
    this.initState({
    });
  }

  public render(): JSX.Element {
    const { t } = this.props;

    return (
      <div style={{ position: 'relative' }}>
      </div>
    );
  }
}

function mapStateToProps(): IConnectedProps {
  return {};
}

function mapDispatchToProps(dispatch: Redux.Dispatch<any>): IActionProps {
  return {
  };
}


export default translate(['common'], { wait: false })(
  connect(mapStateToProps, mapDispatchToProps)(
    Settings));
