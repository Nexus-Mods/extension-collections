import * as React from 'react';
import { ControlLabel, FormControl } from 'react-bootstrap';
import { FlexLayout, tooltip, types } from 'vortex-api';
import { INSTRUCTIONS_PLACEHOLDER } from '../../constants';

export interface IInstructionProps {
  t: types.TFunction;
  collection: types.IMod;
  onSetCollectionAttribute: (path: string[], value: any) => void;
}

function Instructions(props: IInstructionProps) {
  const { t, collection, onSetCollectionAttribute } = props;

  const [input, setInput] = React.useState(collection.attributes?.['collection']?.['installInstructions']);
  const [placeholder, setPlaceholder] = React.useState(t(INSTRUCTIONS_PLACEHOLDER) as string);
  const [hasChanged, setHasChanged] = React.useState(false);

  React.useEffect(() => {
    setInput(collection.attributes?.['collection']?.['installInstructions']);
  }, [collection]);

  const assignInstructions = React.useCallback((evt: React.FormEvent<any>) => {
    setInput(evt.currentTarget.value);
    setHasChanged(true);
  }, [setInput]);

  const saveInstructions = React.useCallback(() => {
    onSetCollectionAttribute(['installInstructions'], input);
    setHasChanged(false);
  }, [input]);

  return (
    <FlexLayout type='column' id='collection-instructions-edit' className='collection-instructions-edit'>
      <FlexLayout.Fixed>
        <ControlLabel target='collection-instructions-area'>
          <p>
            {t('Instructions will be shown to the user before installation starts and can be reviewed in the Instructions tab. You can also add individual mod instructions in the Mods tab.')}
          </p>
        </ControlLabel>
      </FlexLayout.Fixed>
      <FlexLayout.Flex>
        <FormControl
          id='collection-instructions-area'
          componentClass='textarea'
          value={input}
          onChange={assignInstructions}
          placeholder={placeholder}
          onFocus={(e) => setPlaceholder('')} 
          onBlur={(e) => setPlaceholder(t(INSTRUCTIONS_PLACEHOLDER))} 
          rows={8}
        />
      </FlexLayout.Flex>
      <FlexLayout.Fixed className='collection-instructions-buttons'>
        <tooltip.Button
          disabled={!hasChanged}
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
