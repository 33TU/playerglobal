import { ASObject, Errors, checkNullParameter } from '@awayfl/avm2';
import { Matrix } from './Matrix';
import { ColorTransform } from './ColorTransform';
import { Rectangle } from './Rectangle';
import { Matrix3D } from './Matrix3D';
import { release, notImplemented } from '@awayfl/swf-loader';
import { PerspectiveProjection } from './PerspectiveProjection';
import { DisplayObject } from '../display/DisplayObject';

import { Transform as AwayTransform, ColorTransform as AwayColorTransform } from '@awayjs/core';
import { SecurityDomain } from '../SecurityDomain';

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
// Projection state belongs to the display transform, including explicit new Transform(object) wrappers.
const projections = new WeakMap<AwayTransform, PerspectiveProjection>();

// Class: Transform
export class Transform extends ASObject {
	private _adaptee: AwayTransform;
	private _displayObject: DisplayObject;

	static classInitializer: any = null;

	public get adaptee(): AwayTransform {
		return this._adaptee;
	}

	constructor (displayObjectAdaptee: DisplayObject | AwayTransform, owner: DisplayObject = null) {
		super();

		if (!displayObjectAdaptee)
			this.sec.throwError('ArgumentError', Errors.NullPointerError, 'displayObject');

		this._displayObject = displayObjectAdaptee instanceof AwayTransform ? owner : displayObjectAdaptee;
		this._adaptee = (displayObjectAdaptee instanceof AwayTransform)
			? displayObjectAdaptee : displayObjectAdaptee.adaptee.transform;
	}

	public get matrix(): Matrix {
		return new (<SecurityDomain> this.sec).flash.geom.Matrix(this._adaptee.matrix);
	}

	public set matrix(value: Matrix) {
		this._adaptee.matrix = value.adaptee;
	}

	public get colorTransform(): ColorTransform {
		return new (<SecurityDomain> this.sec).flash.geom.ColorTransform(this._adaptee.colorTransform.clone());
	}

	public set colorTransform(value: ColorTransform) {
		this._adaptee.colorTransform = value.adaptee;
	}

	public get concatenatedMatrix(): Matrix {
		return new (<SecurityDomain> this.sec).flash.geom.Matrix(this._adaptee.matrix);
	}

	public get concatenatedColorTransform(): ColorTransform {
		release || notImplemented('public flash.geom.Transform::get concatenatedColorTransform');

		return new (<SecurityDomain> this.sec).flash.geom.ColorTransform(this._adaptee.colorTransform);
	}

	public get pixelBounds(): Rectangle {
		// Only somewhat implemented because this is largely untested.
		release || notImplemented('public flash.geom.Transform::get pixelBounds');

		return new (<SecurityDomain> this.sec).flash.geom.Rectangle(this._adaptee.pixelBounds);
	}

	public get matrix3D(): Matrix3D {
		return new (<SecurityDomain> this.sec).flash.geom.Matrix3D(this._adaptee.matrix3D);
	}

	public set matrix3D(m: Matrix3D) {
		release || notImplemented('public flash.geom.Transform::set matrix3D');
	}

	public getRelativeMatrix3D(relativeTo: DisplayObject): Matrix3D {
		checkNullParameter(relativeTo, 'relativeTo', this.sec);
		release || notImplemented('public flash.geom.Transform::getRelativeMatrix3D');

		// TODO: actually calculate the relative matrix.
		return new (<SecurityDomain> this.sec).flash.geom.Matrix3D(this._adaptee.matrix3D);
	}

	public get perspectiveProjection(): PerspectiveProjection {
		if (projections.has(this._adaptee))
			return projections.get(this._adaptee);
		const owner = this._displayObject;
		if (!owner || (owner.root !== owner && owner.stage !== owner))
			return null;
		const projection = new (<SecurityDomain> this.sec).flash.geom.PerspectiveProjection();
		projection.attach(owner);
		if (owner.stage)
			projection.projectionCenter = new (<SecurityDomain> this.sec).flash.geom.Point(
				owner.stage.stageWidth / 2, owner.stage.stageHeight / 2);
		projections.set(this._adaptee, projection);
		return projection;
	}

	public set perspectiveProjection(projection: PerspectiveProjection) {
		if (projection) {
			// Assignment copies values; do not reattach another object's projection.
			const copy = new (<SecurityDomain> this.sec).flash.geom.PerspectiveProjection();
			copy.fieldOfView = projection.fieldOfView;
			copy.projectionCenter = projection.projectionCenter;
			copy.attach(this._displayObject);
			projections.set(this._adaptee, copy);
		} else {
			projections.set(this._adaptee, null);
		}
	}
}
