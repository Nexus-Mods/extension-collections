import { MAX_COLLECTION_NAME_LENGTH, NAMESPACE } from '../../constants';
import InstallDriver, { Step } from '../../util/InstallDriver';

import CollectionThumbnail from '../CollectionTile';

import YouCuratedTag from './YouCuratedThisTag';

import * as React from 'react';
import { Button, Media } from 'react-bootstrap';
import { withTranslation } from 'react-i18next';
import { connect } from 'react-redux';
import Select from 'react-select';
import * as Redux from 'redux';
import { generate as shortid} from 'shortid';
import { actions, ComponentEx, FlexLayout, log, Modal, More, selectors, types, util } from 'vortex-api';

interface IInstallDialogProps {
  onHide: () => void;
  visible: boolean;
  driver: InstallDriver;
  onSwitchProfile: (profileId: string) => Promise<void>;
}

interface IConnectedProps {
  allProfiles: { [profileId: string]: types.IProfile };
  mods: { [modId: string]: types.IMod };
  isPremium: boolean;
  userInfo: { userId: number };
  nextProfileId: string;
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
  confirmProfile: boolean;
}

function nop() {
  // nop
}

interface IInstallDialogSelectProfileProps {
  t: types.TFunction;
  profile: types.IProfile;
  selectedProfile: string;
  allProfiles: { [profileId: string]: types.IProfile };
  onSelectProfile: (value: { value: string, label: string }) => void;
}

function InstallDialogSelectProfile(props: IInstallDialogSelectProfileProps) {
  const { t, allProfiles, onSelectProfile, profile, selectedProfile } = props;

  const profileOptions = Object.keys(allProfiles)
    .filter(profId => allProfiles[profId].gameId === profile.gameId)
    .map(profId => ({
      value: profId,
      label: profId === profile.id
        ? t('{{name}} (Current)', { replace: { name: profile.name } })
        : allProfiles[profId].name,
    }))
    .concat({ value: '__new', label: t('Create new profile') });

  return (
    <>
      <p>{t('has been added to your collections.')}</p>
      <p className='gutter-above'>{t('Install this collection to profile') + ':'}</p>
      <FlexLayout type='row' id='collections-profile-select'>
        <FlexLayout.Flex>
          <Select
            options={profileOptions}
            value={selectedProfile ?? profile.id}
            onChange={onSelectProfile}
            clearable={false}
          />
        </FlexLayout.Flex>
        <FlexLayout.Fixed>
          <More id='more-profile-instcollection' name={t('Profiles')} wikiId='profiles'>
            {util.getText('profile' as any, 'profiles', t)}
          </More>
        </FlexLayout.Fixed>
      </FlexLayout>
    </>
  );
}

interface IInstallDialogConfirmProfileProps {
  t: types.TFunction;
  collectionName: string;
  selectedProfile: types.IProfile;
}

function InstallDialogConfirmProfile(props: IInstallDialogConfirmProfileProps) {
  const { t, collectionName, selectedProfile } = props;

  const profileName = selectedProfile?.name
                    ?? collectionName;

  return (
    <>
      <p>{t('is installing to profile: {{profileName}}', {
        replace: {
          profileName,
        },
      })}</p>
      <p>{t('Do you want to switch to this profile?')}</p>
    </>
  );
}


/**
 * Installation prompt that shows up when the user imports a collection
 */
class InstallDialog extends ComponentEx<IProps, IInstallDialogState> {
  private mLastCollection: types.IMod;
  constructor(props: IProps) {
    super(props);

    this.initState({
      selectedProfile: undefined,
      confirmProfile: false,
    });

    if (props.driver !== undefined) {
      this.props.driver.onUpdate(() => this.forceUpdate());
    }
  }

  public componentDidUpdate(prevProps: IProps) {
    const { driver } = this.props;
    if (driver !== undefined) {
      if (driver !== prevProps.driver) {
        driver.onUpdate(() => this.forceUpdate());
      }

      if (driver.collection !== this.mLastCollection) {
        this.nextState.confirmProfile = false;
        this.nextState.selectedProfile = undefined;
        this.mLastCollection = driver.collection;
      }
    }
  }

  public render(): React.ReactNode {
    const { t, driver, allProfiles, nextProfileId, userInfo } = this.props;
    const { selectedProfile } = this.state;

    if (driver?.profile === undefined) {
      return null;
    }

    const { profile } = driver;

    if (nextProfileId !== profile.id) {
      return null;
    }

    const game = util.getGame(profile.gameId);

    const ownCollection: boolean = (userInfo?.userId !== undefined)
                                && (driver.collectionInfo?.user?.memberId === userInfo?.userId);
    const collectionName = util.renderModName(driver.collection);
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
            <h3>{collectionName}</h3>
            {(this.state.confirmProfile && (selectedProfile !== undefined)) ? (
              <InstallDialogConfirmProfile
                t={t}
                collectionName={collectionName}
                selectedProfile={selectedProfile === '__new' ? undefined : allProfiles[selectedProfile]}
              />
            ) : (
              <InstallDialogSelectProfile
                t={t}
                allProfiles={allProfiles}
                profile={profile}
                selectedProfile={selectedProfile}
                onSelectProfile={this.changeProfile}
              />
            )}
          </Media.Right>
        </Modal.Body>
        <Modal.Footer>
          {this.state.confirmProfile ? (
            <>
              <Button onClick={this.next}>{t('No')}</Button>
              <Button onClick={this.switchProfile}>{t('Yes')}</Button>
            </>
          ) : (
            <>
              <Button onClick={this.cancel}>{t('Later')}</Button>
              <Button onClick={this.next}>{t('Install Now')}</Button>
            </>
          )}
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
    if (!this.state.confirmProfile
        && (this.state.selectedProfile !== undefined)
        && (this.state.selectedProfile !== this.props.driver?.profile?.id)) {
      if (this.state.selectedProfile === '__new') {
        const { driver, onAddProfile, onSetProfilesVisible } = this.props;
        const { profile } = driver;

        const profileId = shortid();
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
        this.nextState.selectedProfile = profileId;
      }
      this.nextState.confirmProfile = true;
    } else {
      this.startInstall();
    }
  }

  private switchProfile = async () => {
    const { selectedProfile } = this.state;
    await this.props.onSwitchProfile(selectedProfile);
    this.startInstall();
  }

  private startInstall() {
    const { allProfiles, driver } = this.props;
    const { selectedProfile } = this.state;

    const { profile } = driver;

    if ((selectedProfile !== undefined) && (selectedProfile !== profile.id)) {
      driver.profile = allProfiles[selectedProfile];
    }

    driver.continue();
  }
}

const emptyObject = {};

function mapStateToProps(state: types.IState, ownProps: IInstallDialogProps): IConnectedProps {
  const { editCollectionId } = (state.session as any).collections;
  const gameMode = ownProps.driver?.profile?.gameId;

  const { userInfo } = state.persistent['nexus'] ?? {};

  if (editCollectionId !== undefined) {
    return {
      allProfiles: state.persistent.profiles,
      mods: state.persistent.mods[gameMode],
      isPremium: util.getSafe(state, ['persistent', 'nexus', 'userInfo', 'isPremium'], false),
      userInfo,
      nextProfileId: state.settings.profiles.nextProfileId,
    };
  } else {
    return {
      allProfiles: state.persistent.profiles,
      mods: emptyObject,
      isPremium: util.getSafe(state, ['persistent', 'nexus', 'userInfo', 'isPremium'], false),
      userInfo,
      nextProfileId: state.settings.profiles.nextProfileId,
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
