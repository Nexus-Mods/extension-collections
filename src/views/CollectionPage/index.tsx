import { MOD_TYPE, NAMESPACE } from '../../constants';

import CollectionThumbnail from './CollectionThumbnail';

import * as Promise from 'bluebird';
import I18next from 'i18next';
import * as path from 'path';
import * as React from 'react';
import { Button, Panel, PanelGroup } from 'react-bootstrap';
import { WithTranslation, withTranslation } from 'react-i18next';
import { connect } from 'react-redux';
import * as Redux from 'redux';
import { ThunkDispatch } from 'redux-thunk';
import { ComponentEx, EmptyPlaceholder, Icon, MainPage, selectors, types } from 'vortex-api';

export interface IDownloadViewBaseProps extends WithTranslation {
  active: boolean;
  secondary: boolean;
}

interface IConnectedProps {
  gameMode: string;
  mods: { [modId: string]: types.IMod };
}

interface IActionProps {
}

export type IDownloadViewProps =
  IDownloadViewBaseProps & IConnectedProps & IActionProps & { t: I18next.TFunction };

interface IComponentState {
}

const nop = () => null;

class DownloadView extends ComponentEx<IDownloadViewProps, IComponentState> {
  constructor(props: IDownloadViewProps) {
    super(props);
    this.initState({
    });
  }

  public render(): JSX.Element {
    const { t, gameMode, mods } = this.props;

    const modPacks = Object.values(mods).filter(mod => mod.type === MOD_TYPE);
    const {foreign, own} = modPacks.reduce((prev, mod) => {
      prev.own.push(mod);
      return prev;
    }, { foreign: [], own: [] });

    return (
      <MainPage>
        <MainPage.Body>
          <PanelGroup id='collection-panel-group'>
            <Panel expanded={true} eventKey='foreign' onToggle={nop}>
              <Panel.Heading>
                <Icon name={true ? 'showhide-down' : 'showhide-right'} />
                <Panel.Title>{t('Collections')}</Panel.Title>
              </Panel.Heading>
              <Panel.Body collapsible>
                <div className='collection-list'>
                  {(foreign.length > 0)
                    ? foreign.map(mod =>
                      <CollectionThumbnail key={mod.id} t={t} gameId={gameMode} mod={mod} />)
                    : (
                      <EmptyPlaceholder
                        icon='layout-list'
                        text={t('You have not installed any Collections yet')}
                      />
                    )
                  }
                </div>
              </Panel.Body>
            </Panel>
            <Panel expanded={true} eventKey='custom' onToggle={nop}>
              <Panel.Heading>
                <Icon name={true ? 'showhide-down' : 'showhide-right'} />
                <Panel.Title>{t('My Collections')}</Panel.Title>
              </Panel.Heading>
              <Panel.Body collapsible>
                <div className='collection-list'>
                  {own.map(mod =>
                    <CollectionThumbnail key={mod.id} t={t} gameId={gameMode} mod={mod} />)}
                  <Panel className='collection-create-btn'>
                    <Panel.Body>
                      <Icon name='add' />
                      <div className='collection-create-label'>{t('Create Collection')}</div>
                    </Panel.Body>
                  </Panel>
                </div>
              </Panel.Body>
            </Panel>
          </PanelGroup>

        </MainPage.Body>
      </MainPage>
    );
  }
}

const emptyObj = {};

function mapStateToProps(state: types.IState): IConnectedProps {
  const gameMode = selectors.activeGameId(state);
  return {
    gameMode,
    mods: state.persistent.mods[gameMode] || emptyObj,
  };
}

function mapDispatchToProps(dispatch: ThunkDispatch<any, null, Redux.Action>): IActionProps {
  return {
  };
}

export default
  connect(mapStateToProps, mapDispatchToProps)(
    withTranslation(['common', NAMESPACE])(DownloadView));
