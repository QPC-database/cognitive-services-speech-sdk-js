// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as sdk from "../microsoft.cognitiveservices.speech.sdk";
import {
    ConsoleLoggingListener,
    WebsocketMessageAdapter,
} from "../src/common.browser/Exports";
import { ServiceRecognizerBase } from "../src/common.speech/Exports";
import {
    Events,
    EventType
} from "../src/common/Exports";

import { ByteBufferAudioFile } from "./ByteBufferAudioFile";
import { Settings } from "./Settings";
import { validateTelemetry } from "./TelemetryUtil";
import {
    closeAsyncObjects,
    WaitForCondition
} from "./Utilities";
import { WaveFileAudioInput } from "./WaveFileAudioInputStream";

import { AudioStreamFormatImpl } from "../src/sdk/Audio/AudioStreamFormat";

let objsToClose: any[];

beforeAll(() => {
    // Override inputs, if necessary
    Settings.LoadSettings();
    Events.instance.attachListener(new ConsoleLoggingListener(EventType.Debug));
});

beforeEach(() => {
    objsToClose = [];
    // tslint:disable-next-line:no-console
    console.info("------------------Starting test case: " + expect.getState().currentTestName + "-------------------------");
    // tslint:disable-next-line:no-console
    console.info("Sart Time: " + new Date(Date.now()).toLocaleString());
});

afterEach(async (done: jest.DoneCallback) => {
    // tslint:disable-next-line:no-console
    console.info("End Time: " + new Date(Date.now()).toLocaleString());
    await closeAsyncObjects(objsToClose);
    done();
});

const BuildRecognizerFromWaveFile: (speechConfig?: sdk.SpeechTranslationConfig) => sdk.TranslationRecognizer = (speechConfig?: sdk.SpeechTranslationConfig): sdk.TranslationRecognizer => {

    let s: sdk.SpeechTranslationConfig = speechConfig;
    if (s === undefined) {
        s = BuildSpeechConfig();
        // Since we're not going to return it, mark it for closure.
        objsToClose.push(s);
    }

    const config: sdk.AudioConfig = WaveFileAudioInput.getAudioConfigFromFile(Settings.WaveFile);

    const language: string = Settings.WaveFileLanguage;
    if (s.getProperty(sdk.PropertyId[sdk.PropertyId.SpeechServiceConnection_RecoLanguage]) === undefined) {
        s.speechRecognitionLanguage = language;
    }
    s.addTargetLanguage("de-DE");

    const r: sdk.TranslationRecognizer = new sdk.TranslationRecognizer(s, config);
    expect(r).not.toBeUndefined();

    return r;
};

const BuildSpeechConfig: () => sdk.SpeechTranslationConfig = (): sdk.SpeechTranslationConfig => {
    const s: sdk.SpeechTranslationConfig = sdk.SpeechTranslationConfig.fromSubscription(Settings.SpeechSubscriptionKey, Settings.SpeechRegion);
    expect(s).not.toBeUndefined();
    return s;
};

const FIRST_EVENT_ID: number = 1;
const Recognizing: string = "Recognizing";
const Recognized: string = "Recognized";
const Canceled: string = "Canceled";

test("GetTargetLanguages", () => {
    // tslint:disable-next-line:no-console
    console.info("Name: GetTargetLanguages");
    const r: sdk.TranslationRecognizer = BuildRecognizerFromWaveFile();
    objsToClose.push(r);

    expect(r.targetLanguages).not.toBeUndefined();
    expect(r.targetLanguages).not.toBeNull();
    expect(r.targetLanguages.length).toEqual(1);
    expect(r.targetLanguages[0]).toEqual(r.properties.getProperty(sdk.PropertyId[sdk.PropertyId.SpeechServiceConnection_TranslationToLanguages]));
});

test.skip("GetOutputVoiceNameNoSetting", () => {
    // tslint:disable-next-line:no-console
    console.info("Name: GetOutputVoiceNameNoSetting");
    const r: sdk.TranslationRecognizer = BuildRecognizerFromWaveFile();
    objsToClose.push(r);
    expect(r.voiceName).not.toBeUndefined();
});

test("GetParameters", () => {
    // tslint:disable-next-line:no-console
    console.info("Name: GetParameters");
    const r: sdk.TranslationRecognizer = BuildRecognizerFromWaveFile();
    objsToClose.push(r);

    expect(r.properties).not.toBeUndefined();
    expect(r.speechRecognitionLanguage).toEqual(r.properties.getProperty(sdk.PropertyId.SpeechServiceConnection_RecoLanguage, ""));

    // TODO this cannot be true, right? comparing an array with a string parameter???
    expect(r.targetLanguages.length).toEqual(1);
    expect(r.targetLanguages[0]).toEqual(r.properties.getProperty(sdk.PropertyId.SpeechServiceConnection_TranslationToLanguages));
});

describe.each([false])("Service based tests", (forceNodeWebSocket: boolean) => {

    beforeEach(() => {
        // tslint:disable-next-line:no-console
        console.info("forceNodeWebSocket: " + forceNodeWebSocket);
        WebsocketMessageAdapter.forceNpmWebSocket = forceNodeWebSocket;
    });
    afterAll(() => {
        WebsocketMessageAdapter.forceNpmWebSocket = false;
    });

    test("Translate Multiple Targets", (done: jest.DoneCallback) => {
        // tslint:disable-next-line:no-console
        console.info("Name: Translate Multiple Targets");
        const s: sdk.SpeechTranslationConfig = BuildSpeechConfig();
        objsToClose.push(s);
        s.addTargetLanguage("en-US");

        const r: sdk.TranslationRecognizer = BuildRecognizerFromWaveFile(s);
        objsToClose.push(r);

        r.canceled = (o: sdk.Recognizer, e: sdk.TranslationRecognitionCanceledEventArgs): void => {
            try {
                expect(e.errorDetails).toBeUndefined();
            } catch (error) {
                done.fail(error);
            }
        };

        r.recognizeOnceAsync(
            (res: sdk.TranslationRecognitionResult) => {
                expect(res).not.toBeUndefined();
                expect(res.errorDetails).toBeUndefined();
                expect(sdk.ResultReason[res.reason]).toEqual(sdk.ResultReason[sdk.ResultReason.TranslatedSpeech]);
                expect("Wie ist das Wetter?").toEqual(res.translations.get("de", ""));
                expect("What's the weather like?").toEqual(res.translations.get("en", ""));
                done();
            },
            (error: string) => {
                done.fail(error);
            });
    });

    test("Translate Bad Language", (done: jest.DoneCallback) => {
        // tslint:disable-next-line:no-console
        console.info("Name: Translate Bad Language");
        const s: sdk.SpeechTranslationConfig = BuildSpeechConfig();
        objsToClose.push(s);

        s.addTargetLanguage("bo-GU");

        const r: sdk.TranslationRecognizer = BuildRecognizerFromWaveFile(s);
        objsToClose.push(r);

        expect(r).not.toBeUndefined();

        expect(r instanceof sdk.Recognizer).toEqual(true);

        r.synthesizing = ((o: sdk.Recognizer, e: sdk.TranslationSynthesisEventArgs) => {
            try {
                if (e.result.reason === sdk.ResultReason.Canceled) {
                    done.fail(sdk.ResultReason[e.result.reason]);
                }
            } catch (error) {
                done.fail(error);
            }
        });

        r.recognizeOnceAsync(
            (res: sdk.TranslationRecognitionResult) => {
                expect(res).not.toBeUndefined();
                expect(res.errorDetails).not.toBeUndefined();
                expect(sdk.ResultReason[res.reason]).toEqual(sdk.ResultReason[sdk.ResultReason.RecognizedSpeech]);
                expect(res.translations).toBeUndefined();
                expect(res.text).toEqual("What's the weather like?");
                done();
            },
            (error: string) => {
                done.fail(error);
            });
    });

    test("RecognizeOnce Bad Language", (done: jest.DoneCallback) => {
        // tslint:disable-next-line:no-console
        console.info("Name: RecognizeOnce Bad Language");
        const s: sdk.SpeechTranslationConfig = BuildSpeechConfig();
        objsToClose.push(s);
        s.speechRecognitionLanguage = "BadLanguage";
        s.addTargetLanguage("en-US");

        const r: sdk.TranslationRecognizer = BuildRecognizerFromWaveFile(s);
        objsToClose.push(r);
        let doneCount: number = 0;

        r.canceled = (o: sdk.Recognizer, e: sdk.TranslationRecognitionCanceledEventArgs) => {
            try {
                expect(sdk.CancellationReason[e.reason]).toEqual(sdk.CancellationReason[sdk.CancellationReason.Error]);
                expect(sdk.CancellationErrorCode[e.errorCode]).toEqual(sdk.CancellationErrorCode[sdk.CancellationErrorCode.ConnectionFailure]);
                expect(e.errorDetails).toContain("1006");
                doneCount++;
            } catch (error) {
                done.fail(error);
            }
        };

        r.recognizeOnceAsync((result: sdk.TranslationRecognitionResult) => {
            try {
                const e: sdk.CancellationDetails = sdk.CancellationDetails.fromResult(result);
                expect(sdk.CancellationReason[e.reason]).toEqual(sdk.CancellationReason[sdk.CancellationReason.Error]);
                expect(sdk.CancellationErrorCode[e.ErrorCode]).toEqual(sdk.CancellationErrorCode[sdk.CancellationErrorCode.ConnectionFailure]);
                expect(e.errorDetails).toContain("1006");
                doneCount++;
            } catch (error) {
                done.fail(error);
            }
        });

        WaitForCondition(() => (doneCount === 2), done);
    });
});
