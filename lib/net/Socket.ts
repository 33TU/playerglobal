import { axCoerceString, ByteArray, Errors } from '@awayfl/avm2';
import { EventDispatcher } from '../events/EventDispatcher';
import { Event } from '../events/Event';
import { ProgressEvent } from '../events/ProgressEvent';
import { SecurityDomain } from '../SecurityDomain';
import type { IDataInput } from '../utils/IDataInput';
import type { IDataOutput } from '../utils/IDataOutput';

/**
 * Copyright 2014 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/** Binary WebSocket transport to an embedder-configured TCP proxy. */
export class Socket extends EventDispatcher implements IDataInput, IDataOutput {
	static forceNativeConstructor = true;
	static forceNativeMethods = true;

	private _input: ByteArray;
	private _output: ByteArray;
	private _socket: WebSocket = null;
	private _connected = false;
	private _failed = false;
	private _attempt = 0;
	private _timer: ReturnType<typeof setTimeout> = null;
	private _connectTimeout = 20000;

	constructor(host: string = null, port: number = 0) {
		super();
		const sec = <SecurityDomain> this.sec;
		this._input = new sec.flash.utils.ByteArray();
		this._output = new sec.flash.utils.ByteArray();
		this.endian = 'bigEndian';
		this.objectEncoding = 3;
		if (host != null) this.connect(host, port);
	}

	get timeout(): number { return this._connectTimeout; }
	set timeout(value: number) { this._connectTimeout = value >>> 0; }
	get connected(): boolean { return this._connected; }
	get bytesAvailable(): number { return this._input.bytesAvailable; }
	get bytesPending(): number { return this._output.length + (this._socket?.bufferedAmount || 0); }
	get endian(): string { return this._input.endian; }
	set endian(value: string) {
		value = axCoerceString(value);
		if (value !== 'bigEndian' && value !== 'littleEndian')
			this.sec.throwError('ArgumentError', Errors.InvalidEnumError, 'endian');
		this._input.endian = this._output.endian = value;
	}
	get objectEncoding(): number { return this._input.objectEncoding; }
	set objectEncoding(value: number) {
		value >>>= 0;
		if (value !== 0 && value !== 3)
			this.sec.throwError('ArgumentError', Errors.InvalidEnumError, 'objectEncoding');
		this._input.objectEncoding = this._output.objectEncoding = value;
	}

	connect(host: string, port: number): void {
		host = axCoerceString(host) || new URL(document.baseURI).hostname;
		port |= 0;
		if (port < 1 || port > 65535)
			this.sec.throwError('SecurityError', { code: 2003, message: 'Invalid socket port number specified.' });

		this._disconnect();
		this._failed = false;
		const attempt = this._attempt;
		const config = (<SecurityDomain> this.sec).player.config.socketProxy;
		let proxyUrl: string;
		try {
			proxyUrl = typeof config === 'function' ? config(host, port)
				: config?.find(entry => entry.host === host && entry.port === port)?.proxyUrl;
			if (!proxyUrl || !/^wss?:\/\//i.test(proxyUrl)) throw new Error('No socket proxy configured');
		} catch (_) {
			// Defer failures so constructor callers can register event listeners.
			this._timer = setTimeout(() => {
				if (attempt === this._attempt) this._fail('securityError', 'No WebSocket proxy configured for this socket.');
			}, 0);
			return;
		}

		let ws: WebSocket;
		try {
			ws = new WebSocket(proxyUrl);
			ws.binaryType = 'arraybuffer';
		} catch (_) {
			this._timer = setTimeout(() => {
				if (attempt === this._attempt) this._fail('ioError', 'Unable to open the WebSocket proxy.');
			}, 0);
			return;
		}
		this._socket = ws;
		const current = () => this._socket === ws && attempt === this._attempt;
		this._timer = setTimeout(() => {
			if (current()) this._fail('ioError', 'Socket connection timed out.');
		}, Math.min(this.timeout, 0x7fffffff));
		ws.onopen = () => {
			if (!current()) return;
			this._clearTimer();
			this._connected = true;
			this._dispatch(new (<SecurityDomain> this.sec).flash.events.Event(Event.CONNECT));
		};
		ws.onmessage = event => {
			if (!current() || !this._connected) return;
			if (!(event.data instanceof ArrayBuffer)) {
				this._fail('ioError', 'The socket proxy must send binary WebSocket messages.');
				return;
			}
			if (!event.data.byteLength) return;
			this._appendInput(new Uint8Array(event.data));
			this._dispatch(new (<SecurityDomain> this.sec).flash.events.ProgressEvent(
				ProgressEvent.SOCKET_DATA, false, false, this.bytesAvailable, 0));
		};
		ws.onerror = () => { if (current()) this._fail('ioError', 'Socket proxy connection failed.'); };
		ws.onclose = event => {
			if (!current()) return;
			if (event.code !== 1000 && event.code !== 1001) {
				this._fail('ioError', 'Socket proxy connection failed.');
				return;
			}
			if (!this._connected) {
				this._fail('ioError', 'Socket proxy closed before connecting.');
				return;
			}
			this._disconnect();
			this._dispatch(new (<SecurityDomain> this.sec).flash.events.Event(Event.CLOSE));
		};
	}

	close(): void {
		this._requireConnected();
		this._disconnect(); // Explicit close never dispatches Event.CLOSE.
	}

	flush(): void {
		this._requireConnected();
		if (!this._output.length) return;
		try {
			// WebSocket.send snapshots the bytes before the buffer is cleared/reused.
			this._socket.send(this._output.getBytes());
		} catch (_) {
			this._fail('ioError', 'Failed to send socket data.');
			return;
		}
		this._output.length = 0;
	}

	private _appendInput(bytes: Uint8Array): void {
		const input = this._input;
		let position = input.position;
		if (!input.bytesAvailable) {
			input.length = 0;
			position = 0;
		} else if (position >= 65536 && position >= input.length / 2) {
			// Amortized compaction: don't repeatedly copy a partially read message.
			const remaining = input.bytesAvailable;
			input.getBytes().copyWithin(0, position);
			input.length = remaining;
			position = 0;
		}
		input.position = input.length;
		input.writeRawBytes(bytes);
		input.position = position;
	}

	private _clearTimer(): void {
		if (this._timer !== null) clearTimeout(this._timer);
		this._timer = null;
	}

	private _disconnect(): void {
		const ws = this._socket;
		this._attempt++;
		this._socket = null;
		this._connected = false;
		this._clearTimer();
		if (ws) {
			ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
			ws.close();
		}
		this._input.length = 0;
		this._output.length = 0;
	}

	private _fail(type: string, message: string): void {
		this._disconnect();
		this._failed = true;
		const events = (<SecurityDomain> this.sec).flash.events;
		const ErrorEvent = type === 'securityError' ? events.SecurityErrorEvent : events.IOErrorEvent;
		this._dispatch(new ErrorEvent(type, false, false, message, type === 'securityError' ? 2048 : 2031));
	}

	private _dispatch(event: Event): void {
		event.target = event.currentTarget = this;
		this.dispatchEvent(event);
	}

	private _requireConnected(): void {
		if (!this._connected)
			this.sec.throwError('flash.errors.IOError', { code: 2002, message: 'Operation attempted on invalid socket.' });
	}

	private _read<T>(read: () => T): T {
		this._requireConnected();
		const position = this._input.position;
		try { return read(); } catch (error) {
			// Retain a fragmented UTF/AMF value for retry after the next socketData.
			this._input.position = position;
			throw error;
		}
	}

	readBytes(bytes: any, offset: number = 0, length: number = 0): void {
		if (bytes == null) this.sec.throwError('TypeError', Errors.NullPointerError, 'bytes');
		this._read(() => this._input.readBytes(bytes, offset >>> 0, length >>> 0));
	}
	readBoolean(): boolean { return this._read(() => this._input.readBoolean()); }
	readByte(): number { return this._read(() => this._input.readByte()); }
	readUnsignedByte(): number { return this._read(() => this._input.readUnsignedByte()); }
	readShort(): number { return this._read(() => this._input.readShort()); }
	readUnsignedShort(): number { return this._read(() => this._input.readUnsignedShort()); }
	readInt(): number { return this._read(() => this._input.readInt()); }
	readUnsignedInt(): number { return this._read(() => this._input.readUnsignedInt()); }
	readFloat(): number { return this._read(() => this._input.readFloat()); }
	readDouble(): number { return this._read(() => this._input.readDouble()); }
	readUTF(): string { return this._read(() => this._input.readUTFBytes(this._input.readUnsignedShort())); }
	readUTFBytes(length: number): string { return this._read(() => this._input.readUTFBytes(length >>> 0)); }
	readObject(): any { return this._read(() => this._input.readObject()); }

	writeBytes(bytes: any, offset: number = 0, length: number = 0): void {
		this._requireConnected();
		this._output.writeBytes(bytes, offset >>> 0, length >>> 0);
	}
	writeBoolean(value: boolean): void { this._requireConnected(); this._output.writeBoolean(!!value); }
	writeByte(value: number): void { this._requireConnected(); this._output.writeByte(value | 0); }
	writeShort(value: number): void { this._requireConnected(); this._output.writeShort(value | 0); }
	writeInt(value: number): void { this._requireConnected(); this._output.writeInt(value | 0); }
	writeUnsignedInt(value: number): void { this._requireConnected(); this._output.writeUnsignedInt(value >>> 0); }
	writeFloat(value: number): void { this._requireConnected(); this._output.writeFloat(+value); }
	writeDouble(value: number): void { this._requireConnected(); this._output.writeDouble(+value); }
	writeUTFBytes(value: string): void { this._requireConnected(); this._output.writeUTFBytes(axCoerceString(value)); }
	writeObject(value: any): void { this._requireConnected(); this._output.writeObject(value); }
	writeUTF(value: string): void {
		this._requireConnected();
		const bytes = new TextEncoder().encode(axCoerceString(value));
		if (bytes.length > 65535) this.sec.throwError('RangeError', Errors.ParamRangeError);
		this._output.writeShort(bytes.length);
		this._output.writeRawBytes(bytes);
	}

	readMultiByte(length: number, charSet: string): string {
		return this._read(() => {
			length >>>= 0;
			if (length > this.bytesAvailable) this.sec.throwError('flash.errors.EOFError', Errors.EOFError);
			const start = this._input.position;
			const bytes = this._input.getBytes().subarray(start, start + length);
			const encoding = axCoerceString(charSet)?.toLowerCase().replace(/[-_]/g, '');
			// WHATWG TextDecoder maps ISO-8859-1/ASCII to Windows-1252 instead.
			if (encoding === 'ascii' || encoding === 'usascii' || encoding === 'iso88591' || encoding === 'latin1') {
				const ascii = encoding === 'ascii' || encoding === 'usascii';
				let value = '';
				for (let i = 0; i < bytes.length; i++)
					value += String.fromCharCode(ascii && bytes[i] > 127 ? 0xfffd : bytes[i]);
				this._input.position += length;
				return value;
			}
			let decoder: TextDecoder;
			try { decoder = new TextDecoder(axCoerceString(charSet)); } catch (_) {
				this.sec.throwError('ArgumentError', Errors.InvalidArgumentError, 'charSet');
			}
			const value = decoder.decode(bytes);
			this._input.position += length;
			return value;
		});
	}

	writeMultiByte(value: string, charSet: string): void {
		this._requireConnected();
		value = axCoerceString(value);
		const encoding = axCoerceString(charSet)?.toLowerCase().replace(/[-_]/g, '');
		if (encoding === 'utf8') {
			this._output.writeUTFBytes(value);
		} else if (encoding === 'ascii' || encoding === 'usascii' || encoding === 'iso88591' || encoding === 'latin1') {
			const max = encoding === 'ascii' || encoding === 'usascii' ? 127 : 255;
			for (let i = 0; i < value.length; i++) this._output.writeByte(value.charCodeAt(i) <= max ? value.charCodeAt(i) : 63);
		} else {
			this.sec.throwError('ArgumentError', Errors.InvalidArgumentError, 'charSet');
		}
	}

	// Compatibility with the bundled playerglobal ABC's private hooks.
	internalConnect(host: string, port: number): void { this.connect(host, port); }
	internalGetSecurityErrorMessage(_host: string, _port: number): string { return ''; }
	didFailureOccur(): boolean { return this._failed; }
}
