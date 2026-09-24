import { ASObject, checkNullParameter } from '@awayfl/avm2';
import { SecurityDomain } from '../SecurityDomain';
import { DisplayObject } from '../display/DisplayObject';
import { Point } from './Point';
import { Matrix3D } from './Matrix3D';

// Flash's projection parameters are an AVM object, not AwayJS's camera projection.
// This supplies the scripting API; applying it to 3D rendering remains separate.
export class PerspectiveProjection extends ASObject {
	static classInitializer: any = null;
	private _fieldOfView: number = 55;
	private _centerX: number = 250;
	private _centerY: number = 250;
	private _displayObject: DisplayObject = null;

	constructor() {
		super();
	}

	public attach(displayObject: DisplayObject): void {
		this._displayObject = displayObject;
	}

	private get projectionWidth(): number {
		const stage = this._displayObject?.stage;
		return stage && stage !== this._displayObject ? stage.stageWidth : 500;
	}

	public get fieldOfView(): number {
		return this._fieldOfView;
	}

	public set fieldOfView(value: number) {
		value = +value;
		if (value <= 0 || value >= 180)
			this.sec.throwError('ArgumentError', {
				code: 2182, message: 'Invalid fieldOfView value. The value must be greater than 0 and less than 180.'
			});
		this._fieldOfView = value;
	}

	public get focalLength(): number {
		return this.projectionWidth / (2 * Math.tan(this._fieldOfView * Math.PI / 360));
	}

	public set focalLength(value: number) {
		value = +value;
		if (value <= 0)
			this.sec.throwError('ArgumentError', { code: 2186, message: 'Invalid focalLength %1.' }, value);
		this._fieldOfView = Math.atan(this.projectionWidth / (2 * value)) * 360 / Math.PI;
	}

	public get projectionCenter(): Point {
		return new (<SecurityDomain> this.sec).flash.geom.Point(this._centerX, this._centerY);
	}

	public set projectionCenter(value: Point) {
		checkNullParameter(value, 'projectionCenter', this.sec);
		this._centerX = value.x;
		this._centerY = value.y;
	}

	public toMatrix3D(): Matrix3D {
		const result = new (<SecurityDomain> this.sec).flash.geom.Matrix3D();
		const data = result.adaptee._rawData;
		data.fill(0);
		data[0] = data[5] = this.focalLength;
		data[10] = data[11] = 1;
		return result;
	}
}
