import { IModPackInfo } from '../types/IModPack';
import { validateName } from '../util/validation';

import I18next from 'i18next';
import * as React from 'react';
import { ControlLabel, Form, FormGroup, HelpBlock } from 'react-bootstrap';
import * as semver from 'semver';
import * as url from 'url';
import { ComponentEx, FormInput, types, util } from 'vortex-api';

export interface IInfoPageProps {
  t: I18next.TFunction;
  modpack: types.IMod;
  onSetModPackInfo: (key: string, value: any) => void;
}

type IProps = IInfoPageProps;

interface IInfoPageState {

}

class InfoPage extends ComponentEx<IProps, IInfoPageState> {
  private mSetters: { [key: string]: (value: any) => void } = {};

  constructor(props: IProps) {
    super(props);

    this.initState({});
  }

  public render(): React.ReactNode {
    const { t, modpack } = this.props;

    if (modpack === undefined) {
      return null;
    }

    const author = util.getSafe(modpack.attributes, ['author'], '');
    const authorUrl = util.getSafe(modpack.attributes, ['authorURL'], '');
    const name = util.renderModName(modpack);

    const authorValid = (author.length >= 2) ? 'success' : 'error';
    const nameValid = validateName(name);
    const descriptionValid = (modpack.attributes['shortDescription'].length > 0)
      ? 'success' : 'error';
    let urlValid: 'success' | 'error';
    if (authorUrl.length > 0) {
      try {
        url.parse(authorUrl);
        urlValid = 'success';
      } catch (err) {
        urlValid = 'error';
      }
    }

    return (
      <Form>
        <FormGroup controlId='author' validationState={authorValid}>
          <ControlLabel>{t('Author')}</ControlLabel>
          <FormInput value={author} onChange={this.setter('author')} />
        </FormGroup>
        <FormGroup controlId='authorUrl' validationState={urlValid}>
          <ControlLabel>{t('Author Url')}</ControlLabel>
          <FormInput value={authorUrl} onChange={this.setter('authorURL')} />
        </FormGroup>
        <FormGroup controlId='name' validationState={nameValid.valid}>
          <ControlLabel>{t('Collection Name')}</ControlLabel>
          <FormInput value={name} onChange={this.setter('customFileName')} />
          {nameValid.reason !== undefined ? <HelpBlock>{t(nameValid.reason)}</HelpBlock> : null}
        </FormGroup>
        <FormGroup controlId='shortDescription' validationState={descriptionValid}>
          <ControlLabel>{t('Summary')}</ControlLabel>
          <textarea
            value={modpack.attributes['shortDescription']}
            onChange={this.setter('shortDescription')}
            placeholder={t('Please provide a short description of your collection')}
            rows={4}
            style={{ display: 'block', width: '100%' }}
          />
        </FormGroup>
      </Form>
    );
  }

  private setter(key: string) {
    const { onSetModPackInfo } = this.props;
    if (this.mSetters[key] === undefined) {
      this.mSetters[key] = (value: any) => {
        if (value.currentTarget !== undefined) {
         onSetModPackInfo(key, value.currentTarget.value);
        } else {
         onSetModPackInfo(key, value);
        }
      };
    }

    return this.mSetters[key];
  }
}

export default InfoPage;
