import { NAMESPACE } from '../../constants';
import InstallDriver, { Step } from '../../util/InstallDriver';

import CollectionThumbnail from '../CollectionPage/CollectionThumbnail';

import YouCuratedTag from './YouCuratedThisTag';

import * as React from 'react';
import { Button, Media } from 'react-bootstrap';
import { withTranslation } from 'react-i18next';
import { connect } from 'react-redux';
import Select from 'react-select';
import * as Redux from 'redux';
import { generate as shortid} from 'shortid';
import { actions, ComponentEx, FlexLayout, Modal, More, selectors, types, util } from 'vortex-api';

interface IInstallDialogProps {
  onHide: () => void;
  visible: boolean;
  driver: InstallDriver;
}

interface IConnectedProps {
  profile: types.IProfile;
  allProfiles: { [profileId: string]: types.IProfile };
  mods: { [modId: string]: types.IMod };
  isPremium: boolean;
  userInfo: { userId: number };
}

interface IActionProps {
  onAddProfile: (profile: types.IProfile) => void;
  onSetModAttribute: (gameId: string, modId: string, key: string, value: any) => void;
  onSetModAttributes: (gameId: string, modId: string, attributes: { [key: string]: any }) => void;
  onAddRule: (gameId: string, modId: string, rule: types.IModRule) => void;
  onRemoveRule: (gameId: string, modId: string, rule: types.IModRule) => void;
  onSetProfilesVisible: () => void;
}

type IProps = IInstallDialogProps & IConnectedProps & IActionProps;

interface IInstallDialogState {
  selectedProfile: string;
}

function nop() {
  // nop
}

/**
 * Installation prompt that shows up when the user imports a collection
 */
class InstallDialog extends ComponentEx<IProps, IInstallDialogState> {
  constructor(props: IProps) {
    super(props);

    this.initState({
      selectedProfile: undefined,
    });

    if (props.driver !== undefined) {
      this.props.driver.onUpdate(() => this.forceUpdate());
    }
  }

  public componentDidUpdate(prevProps: IProps) {
    if ((this.props.driver !== undefined) && (this.props.driver !== prevProps.driver))  {
      this.props.driver.onUpdate(() => this.forceUpdate());
    }
  }

  public render(): React.ReactNode {
    const { t, driver,  allProfiles, profile, userInfo } = this.props;
    const { selectedProfile } = this.state;

    if ((driver === undefined) || (profile === undefined)) {
      return null;
    }

    const game = util.getGame(profile.gameId);

    const profileOptions = Object.keys(allProfiles)
      .filter(profId => allProfiles[profId].gameId === profile.gameId)
      .map(profId => ({
        value: profId,
        label: profId === profile.id
          ? t('{{name}} (Current)', { replace: { name: profile.name } })
          : allProfiles[profId].name,
      }))
      .concat({ value: '__new', label: t('Create new profile') });

    const ownCollection: boolean = (userInfo?.userId !== undefined)
                                && (driver.collectionInfo?.user?.memberId === userInfo?.userId);

    return (
      <Modal show={(driver.collection !== undefined) && (driver.step === 'query')} onHide={nop}>
        <Modal.Body>
          <Media.Left>
            <CollectionThumbnail
              t={t}
              gameId={profile.gameId}
              collection={driver.collection}
              details={true}
              imageTime={42}
            />
          </Media.Left>
          <Media.Right style={{ width: '100%' }}>
            {ownCollection ? <YouCuratedTag t={t} /> : null}
            <h5>{game.name}</h5>
            <h3>{util.renderModName(driver.collection)}</h3>
            <p>{t('has been added to your collections.')}</p>
            <p className='gutter-above'>{t('Install this collection to profile') + ':'}</p>
            <FlexLayout type='row' id='collections-profile-select'>
              <FlexLayout.Flex>
                <Select
                  options={profileOptions}
                  value={selectedProfile ?? profile.id}
                  onChange={this.changeProfile}
                  clearable={false}
                />
              </FlexLayout.Flex>
              <FlexLayout.Fixed>
                <More id='more-profile-instcollection' name={t('Profiles')} wikiId='profiles'>
                  {util.getText('profile' as any, 'profiles', t)}
                </More>
              </FlexLayout.Fixed>
            </FlexLayout>
          </Media.Right>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={this.cancel}>{t('Later')}</Button>
          <Button onClick={this.next}>{t('Install Now')}</Button>
        </Modal.Footer>
      </Modal>
    );
  }

  private changeProfile = (value: { value: string, label: string }) => {
    if (!!value) {
      this.nextState.selectedProfile = value.value;
    }
  }

  private cancel = () => {
    this.props.driver.cancel();
  }

  private next = () => {
    const { allProfiles, driver, onAddProfile, onSetProfilesVisible, profile } = this.props;
    const { selectedProfile } = this.state;

    let profileId = selectedProfile ?? profile?.id;

    if (this.state.selectedProfile === '__new') {
      profileId = shortid();
      const name = util.renderModName(driver.collection);
      const newProfile = {
        id: profileId,
        gameId: profile.gameId,
        name,
        modState: {},
        lastActivated: 0,
      };
      onAddProfile(newProfile);
      onSetProfilesVisible();
      driver.profile = newProfile;
    } else if ((selectedProfile !== undefined) && (selectedProfile !== profile.id)) {
      driver.profile = allProfiles[selectedProfile];
    }
    driver.continue();
  }
}

const emptyObject = {};

function mapStateToProps(state: types.IState): IConnectedProps {
  const { editCollectionId } = (state.session as any).collections;
  const profile = selectors.activeProfile(state);
  const gameMode = profile !== undefined
    ? profile.gameId
    : undefined;

  const { userInfo } = state.persistent['nexus'] ?? {};

  if (editCollectionId !== undefined) {
    return {
      profile,
      allProfiles: state.persistent.profiles,
      mods: state.persistent.mods[gameMode],
      isPremium: util.getSafe(state, ['persistent', 'nexus', 'userInfo', 'isPremium'], false),
      userInfo,
    };
  } else {
    return {
      profile,
      allProfiles: state.persistent.profiles,
      mods: emptyObject,
      isPremium: util.getSafe(state, ['persistent', 'nexus', 'userInfo', 'isPremium'], false),
      userInfo,
    };
  }
}

function mapDispatchToProps(dispatch: Redux.Dispatch): IActionProps {
  return {
    onSetModAttribute: (gameId: string, modId: string, key: string, value: any) =>
      dispatch(actions.setModAttribute(gameId, modId, key, value)),
    onSetModAttributes: (gameId: string, modId: string, attributes: { [key: string]: any }) =>
      dispatch(actions.setModAttributes(gameId, modId, attributes)),
    onAddRule: (gameId: string, modId: string, rule: types.IModRule) =>
      dispatch(actions.addModRule(gameId, modId, rule)),
    onRemoveRule: (gameId: string, modId: string, rule: types.IModRule) =>
      dispatch(actions.removeModRule(gameId, modId, rule)),
    onAddProfile: (profile: types.IProfile) =>
      dispatch(actions.setProfile(profile)),
    onSetProfilesVisible: () =>
      dispatch(actions.setProfilesVisible(true)),
  };
}

export default
  withTranslation(['common', NAMESPACE])(
    connect(mapStateToProps, mapDispatchToProps)(
      React.memo(InstallDialog)) as any) as React.ComponentClass<IInstallDialogProps>;
