import { ByteBuffer } from "../../util/ByteBuffer";
import { Definition } from "./Definition";

export class VarpDefinition extends Definition {
    type: number;

    constructor(id: number) {
        super(id);
        this.type = 0;
    }

    override decodeOpcode(opcode: number, buffer: ByteBuffer): void {
        if (opcode == 5) {
            this.type = buffer.readUnsignedShort();
        }
    }
}