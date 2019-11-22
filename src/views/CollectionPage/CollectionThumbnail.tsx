import * as Promise from 'bluebird';
import I18next from 'i18next';
import * as path from 'path';
import * as React from 'react';
import { Image, Panel } from 'react-bootstrap';
import { connect } from 'react-redux';
import { Icon, IconBar, PureComponentEx, selectors, types, util } from 'vortex-api';
import { AUTHOR_UNKNOWN } from '../../constants';

export interface IBaseProps {
  t: I18next.TFunction;
  gameId: string;
  collection: types.IMod;
  details: boolean;
  onView?: (modId: string) => void;
}

interface IConnectedProps {
  stagingPath: string;
  profile: types.IProfile;
}

type IProps = IBaseProps & IConnectedProps;

class CollectionThumbnail extends PureComponentEx<IProps, {}> {
  private mActions: types.IActionDefinition[] = [];

  public componentWillMount() {
    if (this.props.onView) {
      this.mActions.push({
        title: 'View',
        icon: 'show',
        action: (instanceIds: string[]) => this.props.onView(instanceIds[0]),
      });
    }
    /*
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
    */
  }

  public render(): JSX.Element {
    const { t, collection, details, profile, stagingPath } = this.props;

    const logoPath = path.join(stagingPath, collection.installationPath, 'logo.jpg');
    const active = util.getSafe(profile, ['modState', collection.id, 'enabled'], false);

    const mods = (collection.rules || [])
      .filter(rule => ['requires', 'recommends'].includes(rule.type));

    return (
      <Panel className='collection-thumbnail' bsStyle={active ? 'primary' : 'default'}>
        <Panel.Body className='collection-thumbnail-body'>
          <img
            className={'thumbnail-img'}
            src={logoPath}
          />
          <div className='gradient' />
          {details ? (
            <div className='collection-status-container'>
              {active ? <div className='collection-status'>{t('Enabled')}</div> : null}
            </div>
          ) : null}
          {details ? (
            <div className='collection-version-container'>
              <div className='collection-version'>
                {util.getSafe(collection.attributes, ['version'], '0.0.0')}
              </div>
            </div>
          ) : null}
          {details ? (
            <div className='bottom'>
              <div className='name'>
                {util.renderModName(collection, { version: false })}
              </div>
              <div className='active-mods'>
                <span>{t('{{ count }} mod', { count: mods.length })}</span>
              </div>
              <div className='author'>
                <Image
                  src='assets/images/noavatar.png'
                  circle
                />
                {util.getSafe(collection.attributes, ['author'], undefined)
                  || `${t(AUTHOR_UNKNOWN)}`}
              </div>
            </div>
          ) : null}
          {(this.mActions.length > 0) ? (
            <div className='hover-menu'>
              {this.renderMenu()}
            </div>
          ) : null}
        </Panel.Body>
      </Panel>
    );
  }

  private renderMenu(): JSX.Element[] {
    const { t, collection: mod } = this.props;

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
