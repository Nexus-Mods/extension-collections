import * as React from 'react';
import { ControlLabel, FormControl } from 'react-bootstrap';
import { FlexLayout, tooltip, types } from 'vortex-api';
import { DEFAULT_INSTRUCTIONS } from '../../constants';

export interface IInstructionProps {
  t: types.TFunction;
  collection: types.IMod;
  onSetCollectionAttribute: (path: string[], value: any) => void;
}

function Instructions(props: IInstructionProps) {
  const { t, collection, onSetCollectionAttribute } = props;

  const [input, setInput] = React.useState(collection.attributes?.['collection']?.['installInstructions']);

  React.useEffect(() => {
    setInput(collection.attributes?.['collection']?.['installInstructions']);
  }, [collection]);

  const assignInstructions = React.useCallback((evt: React.FormEvent<any>) => {
    setInput(evt.currentTarget.value);
  }, [setInput]);

  const saveInstructions = React.useCallback(() => {
    onSetCollectionAttribute(['installInstructions'], input);
  }, [input]);

  return (
    <FlexLayout type='column' id='collection-instructions-edit' className='collection-instructions-edit'>
      <FlexLayout.Fixed>
        <ControlLabel target='collection-instructions-area'>
          <p>
            {t('Provide collection instructions or requirements here. '
              + 'For example, steps required before or after the collection installs. '
              + 'This will be shown before installation starts and can be reviewed in the Instructions tab. '
              + 'You can also add individual mod instructions in the Mods tab.')}
          </p>
        </ControlLabel>
      </FlexLayout.Fixed>
      <FlexLayout.Flex>
        <FormControl
          id='collection-instructions-area'
          componentClass='textarea'
          value={input ?? t(DEFAULT_INSTRUCTIONS)}
          onChange={assignInstructions}
          placeholder={t('Please provide some basic instructions')}
          rows={8}
        />
      </FlexLayout.Flex>
      <FlexLayout.Fixed className='collection-instructions-buttons'>
        <tooltip.Button
          disabled={input === undefined}
          tooltip={t('Save Instructions')}
          onClick={saveInstructions}
        >
          {t('Save')}
        </tooltip.Button>
      </FlexLayout.Fixed>
    </FlexLayout>
  );
}

export default Instructions;
