import { MOD_TYPE } from '../../constants';

import CollectionThumbnail from './CollectionThumbnail';

import i18next from 'i18next';
import * as React from 'react';
import { Panel, PanelGroup } from 'react-bootstrap';
import { ComponentEx, EmptyPlaceholder, Icon, types } from 'vortex-api';

export interface IStartPageProps {
  t: i18next.TFunction;
  gameMode: string;
  mods: { [modId: string]: types.IMod };
  onView: (modId: string) => void;
}

interface IComponentState {
}

const nop = () => null;

class StartPage extends ComponentEx<IStartPageProps, IComponentState> {
  constructor(props: IStartPageProps) {
    super(props);
    this.initState({
    });
  }

  public render(): JSX.Element {
    const { t, gameMode, mods, onView } = this.props;

    const modPacks = Object.values(mods).filter(mod => mod.type === MOD_TYPE);
    const {foreign, own} = modPacks.reduce((prev, mod) => {
      prev.own.push(mod);
      return prev;
    }, { foreign: [], own: [] });

    return (
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
                  <CollectionThumbnail
                    key={mod.id}
                    t={t}
                    gameId={gameMode}
                    collection={mod}
                    onView={onView}
                  />)
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
                <CollectionThumbnail
                  key={mod.id}
                  t={t}
                  gameId={gameMode}
                  collection={mod}
                  onView={onView}
                />)}
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
    );
  }
}

export default StartPage as React.ComponentClass<IStartPageProps>;
