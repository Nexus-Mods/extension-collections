import * as Promise from 'bluebird';
import I18next from 'i18next';
import * as path from 'path';
import * as React from 'react';
import { FormControl, Image as BSImage, Panel } from 'react-bootstrap';
import { connect } from 'react-redux';
import * as Redux from 'redux';
import { actions, Icon, IconBar, Image, PureComponentEx, selectors, tooltip, types, util } from 'vortex-api';
import { AUTHOR_UNKNOWN } from '../../constants';
import CollectionReleaseStatus from './CollectionReleaseStatus';

export interface IBaseProps {
  t: I18next.TFunction;
  className?: string;
  gameId: string;
  collection: types.IMod;
  mods?: { [modId: string]: types.IMod };
  incomplete?: boolean;
  details: boolean;
  imageTime: number;
  onResume?: (modId: string) => void;
  onEdit?: (modId: string) => void;
  onView?: (modId: string) => void;
  onRemove?: (modId: string) => void;
  onUpload?: (modId: string) => void;
}

interface IConnectedProps {
  stagingPath: string;
  profile: types.IProfile;
}

interface IActionProps {
  onSetModAttribute: (gameId: string, modId: string, key: string, value: any) => void;
}

type IProps = IBaseProps & IConnectedProps & IActionProps;

interface IModNameFieldProps {
  t: types.TFunction;
  name: string;
  onChange: (name: string) => void;
}

function ModNameField(props: IModNameFieldProps) {
  const { t, name, onChange } = props;

  const [editing, setEditing] = React.useState(false);
  const [tempName, setTempName] = React.useState(name);

  const changeInput = React.useCallback((evt: React.FormEvent<any>) => {
    setTempName(evt.currentTarget.value);
  }, [setTempName]);

  const apply = React.useCallback(() => {
    onChange(tempName);
    setEditing(false);
  }, [setEditing, tempName]);

  const keyPress = React.useCallback((evt: React.KeyboardEvent<any>) => {
    if (evt.key === 'Enter') {
      apply();
    }
  }, [apply]);

  const startEdit = React.useCallback(() => {
    setEditing(true);
  }, [setEditing]);

  return (
    <div className='collection-name'>
      {editing ? (
        <>
          <FormControl
            type='text'
            value={tempName}
            placeholder={t('Collection Name')}
            onChange={changeInput}
            autoFocus={true}
            onKeyPress={keyPress}
          />
          <tooltip.IconButton icon='input-confirm' tooltip={t('Save name')} onClick={apply} />
        </>
      ) : (
        <>
          {tempName}
          <tooltip.IconButton icon='edit' tooltip={t('Change name')} onClick={startEdit} />
        </>
      )}
    </div>
  );
}

class CollectionThumbnail extends PureComponentEx<IProps, {}> {
  public render(): JSX.Element {
    const { t, collection, details, imageTime,
            incomplete, mods, onEdit, profile, stagingPath } = this.props;

    if (collection === undefined) {
      return null;
    }

    const logoPath = path.join(stagingPath, collection.installationPath, 'logo.jpg');
    const active = util.getSafe(profile, ['modState', collection.id, 'enabled'], false);

    const refMods: types.IModRule[] = (collection.rules ?? [])
      .filter(rule => ['requires', 'recommends'].includes(rule.type));

    const totalSize: number = Object.values(collection.rules ?? []).reduce((prev, rule) => {
      if (rule.reference.fileSize !== undefined) {
        return prev + rule.reference.fileSize;
      } else if ((rule.reference.id !== undefined) && (mods !== undefined)) {
        return prev + (mods[rule.reference.id]?.attributes?.fileSize ?? 0);
      } else {
        return prev;
      }
    }, 0);

    const classes = ['collection-thumbnail'];

    if (this.props.className !== undefined) {
      classes.push(this.props.className);
    }

    return (
      <Panel className={classes.join(' ')} bsStyle={active ? 'primary' : 'default'}>
        <Panel.Body className='collection-thumbnail-body'>
          <Image
            className='thumbnail-img'
            srcs={[logoPath + `?_r=${imageTime}`, path.join(__dirname, 'fallback_tile.png')]}
            circle={false}
          />
          <div className='gradient' />
          <div className='author'>
            <BSImage
              src='assets/images/noavatar.png'
              circle
            />
            {collection.attributes.author ?? `${t(AUTHOR_UNKNOWN)}`}
          </div>
          {details ? (
            <CollectionReleaseStatus
              t={t}
              active={active}
              collection={collection}
              incomplete={incomplete}
            />
          ) : null}
          {details ? (
            <div className={`bottom ${onEdit !== undefined ? 'editable' : ''} no-hover`}>
              <div className='name'>
                {util.renderModName(collection, { version: false })}
              </div>
               <div className='details'>
                <div><Icon name='mods' />{refMods.length}</div>
                <div><Icon name='archive' />{util.bytesToString(totalSize)}</div>
                <div className='revision-number'>
                  {t('Revision {{number}}', { replace: {
                    number: collection.attributes.version ?? '0',
                  } })}
                </div>
              </div>
            </div>
          ) : null}
          {(this.actions.length > 0) ? (
            <div className='hover-menu'>
              {this.renderMenu(refMods, totalSize)}
            </div>
          ) : null}
        </Panel.Body>
      </Panel>
    );
  }

  private get actions() {
    const { collection, incomplete, onEdit, onUpload, onRemove, onResume, onView } = this.props;

    const result = [];

    if (onView) {
      result.push({
        title: 'View',
        icon: 'show',
        action: (instanceIds: string[]) => {
          onView(instanceIds[0]);
        },
      });
      if (incomplete && (onResume !== undefined)) {
        result.push({
          title: 'Resume',
          icon: 'resume',
          action: (instanceIds: string[]) => {
            if (onResume !== undefined) {
              onResume(instanceIds[0]);
            }
            onView(instanceIds[0]);
          },
        });
      }
    }
    if (onEdit) {
      result.push({
        title: 'Edit',
        icon: 'edit',
        action: (instanceIds: string[]) => onEdit(instanceIds[0]),
      });
    }
    if (onRemove) {
      result.push({
        title: 'Remove',
        icon: 'remove',
        action: (instanceIds: string[]) => onRemove(instanceIds[0]),
      });
    }

    if (onUpload) {
      result.push({
        title: collection.attributes?.collectionId !== undefined ? 'Update' : 'Upload',
        icon: 'clone',
        action: (instanceIds: string[]) => onUpload(instanceIds[0]),
      });
    }

    return result;
  }

  private renderMenu(refMods: types.IModRule[], totalSize: number): JSX.Element[] {
    const { t, collection, onEdit } = this.props;

    return [(
      <div key='primary-buttons' className='hover-content'>
        <IconBar
          id={`collection-thumbnail-${collection.id}`}
          className='buttons'
          group={`collection-actions`}
          instanceId={collection.id}
          staticElements={this.actions}
          collapse={false}
          buttonType='text'
          orientation='vertical'
          clickAnywhere={true}
          t={t}
        />

        <div className='bottom hover'>
          {onEdit !== undefined ? (
          <div className='name'>
            <ModNameField
              t={t}
              name={util.renderModName(collection, { version: false })}
              onChange={this.changeName}
            />
          </div>
          ) : null}
          <div className='details'>
            <div><Icon name='mods' />{refMods.length}</div>
            <div><Icon name='archive' />{util.bytesToString(totalSize)}</div>
            <div className='revision-number'>
              {t('Revision {{number}}', { replace: {
                number: collection.attributes.version ?? '0',
              } })}
            </div>
          </div>
        </div>
      </div>
    )];
  }

  private changeName = (name: string) => {
    const { collection, onSetModAttribute, profile } = this.props;

    onSetModAttribute(profile.gameId, collection.id, 'customFileName', name);
  }
}

const emptyObj = {};

function mapStateToProps(state: types.IState, ownProps: IBaseProps): IConnectedProps {
  return {
    stagingPath: selectors.installPathForGame(state, ownProps.gameId),
    profile: selectors.activeProfile(state),
  };
}

function mapDispatchToProps(dispatch: Redux.Dispatch): IActionProps {
  return {
    onSetModAttribute: (gameId: string, modId: string, key: string, value: any) =>
      dispatch(actions.setModAttribute(gameId, modId, key, value)),
  };
}

export default
  connect(mapStateToProps, mapDispatchToProps)(
    CollectionThumbnail) as React.ComponentType<IBaseProps>;
