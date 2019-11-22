import { NAMESPACE } from '../../constants';

import CollectionPage from './CollectionPage';
import StartPage from './StartPage';

import I18next from 'i18next';
import * as React from 'react';
import { WithTranslation, withTranslation } from 'react-i18next';
import { connect } from 'react-redux';
import * as Redux from 'redux';
import { ThunkDispatch } from 'redux-thunk';
import { ComponentEx, MainPage, selectors, types } from 'vortex-api';

export interface IDownloadViewBaseProps extends WithTranslation {
  active: boolean;
  secondary: boolean;
}

interface IConnectedProps {
  profile: types.IProfile;
  mods: { [modId: string]: types.IMod };
  downloads: { [dlId: string]: types.IDownload };
  notifications: types.INotification[];
}

interface IActionProps {
}

export type IDownloadViewProps =
  IDownloadViewBaseProps & IConnectedProps & IActionProps & { t: I18next.TFunction };

interface IComponentState {
  selectedCollection: string;
}

const nop = () => null;

class CollectionsMainPage extends ComponentEx<IDownloadViewProps, IComponentState> {
  constructor(props: IDownloadViewProps) {
    super(props);
    this.initState({
      selectedCollection: undefined,
    });
  }

  public render(): JSX.Element {
    const { t, downloads, mods, notifications, profile } = this.props;
    const { selectedCollection } = this.state;

    const collection = (selectedCollection !== undefined)
      ? mods[selectedCollection]
      : undefined;

    return (
      <MainPage id='collection-page'>
        <MainPage.Body>
          {(collection !== undefined)
            ? (
              <CollectionPage
                t={t}
                className='collection-details'
                profile={profile}
                collection={collection}
                mods={mods}
                downloads={downloads}
                notifications={notifications}
                onView={this.view}
              />
            )
            : (
              <StartPage
                t={t}
                gameMode={profile.gameId}
                mods={mods}
                onView={this.view}
              />
            )
          }
        </MainPage.Body>
      </MainPage>
    );
  }

  private view = (modId: string) => {
    this.nextState.selectedCollection = modId;
  }
}

const emptyObj = {};

function mapStateToProps(state: types.IState): IConnectedProps {
  const profile = selectors.activeProfile(state);
  return {
    profile,
    mods: state.persistent.mods[profile.gameId] || emptyObj,
    notifications: state.session.notifications.notifications,
    downloads: state.persistent.downloads.files,
  };
}

function mapDispatchToProps(dispatch: ThunkDispatch<any, null, Redux.Action>): IActionProps {
  return {
  };
}

export default
  connect(mapStateToProps, mapDispatchToProps)(
    withTranslation(['common', NAMESPACE])(CollectionsMainPage));
