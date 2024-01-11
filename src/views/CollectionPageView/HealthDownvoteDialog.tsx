import { IRevision, RatingOptions } from '@nexusmods/nexus-api';
import { useTranslation } from 'react-i18next';
import * as React from 'react';
import { Button, Checkbox, Form, FormGroup, Radio } from 'react-bootstrap';
import {
  FlexLayout,
  Icon,
  RadialProgress,
  tooltip,
  MainContext,
  types,
  Modal,
  Usage,
  selectors,
  util,
} from 'vortex-api';
import { NAMESPACE } from '../../constants';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { healthDownvoteDialog } from '../../actions/session';
import { IMod, IState } from 'vortex-api/lib/types/IState';
import { updateSuccessRate } from '../../actions/persistent';
import * as nexus from '@nexusmods/nexus-api';
import { IConnectedProps } from 'vortex-api/lib/views/MainWindow';
import { getSafe } from 'vortex-api/lib/util/api';
import { ICollection } from '../../types/ICollection';
import { IStateEx } from '../../types/IStateEx';

export interface IHealthDownvoteDialogProps {}

function HealthDownvoteDialog(props: IHealthDownvoteDialogProps) {

  const [optionValue, setOptionValue] = React.useState(undefined);
  const [confirmationCheck, setConfirmationCheck] = React.useState(false);

  const context = React.useContext(MainContext);
  
  const { t } = useTranslation(NAMESPACE);  
  const dispatch = useDispatch();

  const state = context.api.store.getState();
  const gameId = selectors.activeGameId(state);
  const collectionId:string = useSelector((state:any) => state.session.collections.healthDownvoteDialog ?? undefined);

  const collection:IMod = (collectionId !== undefined)
  ? state.persistent.mods[gameId]?.[collectionId]
  : undefined;
  
  let revisionInfo: IRevision;
  let collectionInfo;
  let commentLink = '#';
  let bugLink = '#';

  if (collection?.attributes?.revisionId !== undefined) {

    revisionInfo = state.persistent.collections.revisions?.[collection.attributes.revisionId]?.info;

    if (revisionInfo?.collection !== undefined) {

      collectionInfo = state.persistent.collections.collections?.[revisionInfo.collection.id]?.info;
      commentLink = collectionInfo?.['commentLink'] ?? '#';
      bugLink = `https://next.nexusmods.com/${collectionInfo.game.domainName}/collections/${collectionInfo.slug}?tab=Bugs` ?? '#';    
    }
  }  

  const hide = React.useCallback(() => {
    // hide dialog by setting it's state value to undefined
    dispatch(healthDownvoteDialog(undefined));
  }, []);

  const downvote = () => {
    sendRating(false);
    hide();
  }

  const onChecked = (evt: React.FormEvent<any>) => {
    setConfirmationCheck(evt.currentTarget.checked);
  }

  const sendRating = async (success: boolean) => {
    const revisionId = collection?.attributes?.revisionId ?? undefined;
    const vote = success ? 'positive' : 'negative';
    const voted: { success: boolean, averageRating?: nexus.IRating } = (await context.api.emitAndAwait('rate-nexus-collection-revision', parseInt(revisionId, 10), vote))[0];    
    if (voted.success) {
      dispatch(updateSuccessRate(revisionId, vote, voted.averageRating.average, voted.averageRating.total));
    }
  };

  return (   
    <Modal
      id='collection-health-downvote-dialog'
      className='collection-health-downvote-dialog'
      show={collection !== undefined}
      onHide={hide}
    >
      <Modal.Header>
        <Modal.Title>{t('Collection assistance - ') + util.renderModName(collection)}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <h5>{t('We\'re sorry to hear that, here are some steps that could help:')}</h5>
        <ol>
          <li>Make sure your game version matches the version that the collection was created with.</li>
          <li>Read the collection instructions to see if the curator has added any additional steps.</li>
          <li>Check <a href={commentLink}>comments</a> on Nexus Mods for advice and to reach out to the collection curator and other users.</li>
          <li>If you’ve found a bug, view <a href={bugLink}>bug reports</a> on Nexus Mods, or report a new bug to help the curator fix the issue.</li>
        </ol>        
        <FormGroup>
          <Checkbox onChange={onChecked}>I have tried the above steps and it's still not working</Checkbox>
        </FormGroup>
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={hide}>{t('Cancel')}</Button>
        <Button onClick={downvote} disabled={!confirmationCheck}>{t('Submit')}</Button>
      </Modal.Footer>
    </Modal>  
  );
}

export default HealthDownvoteDialog;