import * as Promise from 'bluebird';
import I18next from 'i18next';
import * as path from 'path';
import * as React from 'react';
import { Image, Panel } from 'react-bootstrap';
import { connect } from 'react-redux';
import { Icon, IconBar, PureComponentEx, selectors, types, util } from 'vortex-api';

export interface IBaseProps {
  t: I18next.TFunction;
  gameId: string;
  mod: types.IMod;
}

interface IConnectedProps {
  stagingPath: string;
  profile: types.IProfile;
}

type IProps = IBaseProps & IConnectedProps;

class CollectionThumbnail extends PureComponentEx<IProps, {}> {
  private mActions: types.IActionDefinition[] = [
    {
      title: 'View',
      icon: 'show',
      action: (instanceIds: string[]) => console.log('view', instanceIds),
    },
    {
      title: 'Edit',
      icon: 'edit',
      action: (instanceIds: string[]) => console.log('edit', instanceIds),
    },
    {
      title: 'Publish',
      icon: 'clone',
      action: (instanceIds: string[]) => console.log('publish', instanceIds),
    },
  ];

  public render(): JSX.Element {
    const { t, mod, profile, stagingPath } = this.props;

    const logoPath = path.join(stagingPath, mod.installationPath, 'logo.jpg');
    const active = util.getSafe(profile, ['modState', mod.id, 'enabled'], false);

    const mods = mod.rules.filter(rule => ['requires', 'recommends'].includes(rule.type));

    return (
      <Panel className='collection-thumbnail' bsStyle={active ? 'primary' : 'default'}>
        <Panel.Body className='collection-thumbnail-body'>
          <img
            className={'thumbnail-img'}
            src={logoPath}
          />
          <div className='gradient' />
          <div className='collection-status-container'>
            {active ? <div className='collection-status'>{t('Enabled')}</div> : null}
          </div>
          <div className='collection-version-container'>
            <div className='collection-version'>
              {util.getSafe(mod.attributes, ['version'], '0.0.0')}
            </div>
          </div>
          <div className='bottom'>
            <div className='name'>
              {util.renderModName(mod, { version: false })}
            </div>
            <div className='active-mods'>
              <span>{t('{{ count }} mod', { count: mods.length })}</span>
            </div>
            <div className='author'>
              <Image
                src='assets/images/noavatar.png'
                circle
              />
              {util.getSafe(mod.attributes, ['author'], undefined) || `<${t('Unknown Author')}>`}
            </div>
          </div>
          <div className='hover-menu'>
            {this.renderMenu()}
          </div>
        </Panel.Body>
      </Panel>
    );
  }

  private renderMenu(): JSX.Element[] {
    const { t, mod } = this.props;

    return [(
      <div key='primary-buttons' className='hover-content'>
        <IconBar
          id={`collection-thumbnail-${mod.id}`}
          className='buttons'
          group={`collection-actions`}
          instanceId={mod.id}
          staticElements={this.mActions}
          collapse={false}
          buttonType='text'
          orientation='vertical'
          clickAnywhere={true}
          t={t}
        />
      </div>
    )];
  }
}

const emptyObj = {};

function mapStateToProps(state: types.IState, ownProps: IBaseProps): IConnectedProps {
  return {
    stagingPath: selectors.installPathForGame(state, ownProps.gameId),
    profile: selectors.activeProfile(state),
  };
}

export default
  connect(mapStateToProps)(
    CollectionThumbnail) as React.ComponentClass<IBaseProps>;
