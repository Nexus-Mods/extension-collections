import { IModPackInfo } from '../types/IModPack';

import I18next from 'i18next';
import * as React from 'react';
import { ControlLabel, Form, FormGroup } from 'react-bootstrap';
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
    const authorUrl = util.getSafe(modpack.attributes, ['author_url'], '');
    const name = util.renderModName(modpack);
    const version = util.getSafe(modpack.attributes, ['version'], '');

    const authorValid = (author.length >= 2) ? 'success' : 'error';
    const nameValid =  (name.length >= 4) ? 'success' : 'error';
    const versionValid = semver.valid(version) ? 'success' : 'error';
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
        <FormGroup controlId='author_url' validationState={urlValid}>
          <ControlLabel>{t('Author Url')}</ControlLabel>
          <FormInput value={authorUrl} onChange={this.setter('author_url')} />
        </FormGroup>
        <FormGroup controlId='name' validationState={nameValid}>
          <ControlLabel>{t('Modpack Name')}</ControlLabel>
          <FormInput value={name} onChange={this.setter('customFileName')} />
        </FormGroup>
        <FormGroup controlId='version' validationState={versionValid}>
          <ControlLabel>{t('Version')}</ControlLabel>
          <FormInput value={version} onChange={this.setter('version')} />
        </FormGroup>
        <FormGroup controlId='shortDescription'>
          <ControlLabel>{t('Summary')}</ControlLabel>
          <FormInput
            value={modpack.attributes['shortDescription']}
            onChange={this.setter('shortDescription')}
          />
        </FormGroup>
      </Form>
    );
  }

  private setter(key: string) {
    const { onSetModPackInfo } = this.props;
    if (this.mSetters[key] === undefined) {
      this.mSetters[key] = (value: any) => {
        onSetModPackInfo(key, value);
      };
    }

    return this.mSetters[key];
  }
}

export default InfoPage;
