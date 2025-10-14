/*
Shenzhen ACEBOTT Tech
modified from liusen
load dependency
"TinkerBott": "file:../pxt-TinkerBott"
*/

const enum IR_Button {
    //% block="any"
    Any = -1,
    //% block="▲"
    Up = 0x62,
    //% block=" "
    Unused_2 = -2,
    //% block="◀"
    Left = 0x22,
    //% block="OK"
    Ok = 0x02,
    //% block="▶"
    Right = 0xc2,
    //% block=" "
    Unused_3 = -3,
    //% block="▼"
    Down = 0xa8,
    //% block=" "
    Unused_4 = -4,
    //% block="1"
    Number_1 = 0x68,
    //% block="2"
    Number_2 = 0x98,
    //% block="3"
    Number_3 = 0xb0,
    //% block="4"
    Number_4 = 0x30,
    //% block="5"
    Number_5 = 0x18,
    //% block="6"
    Number_6 = 0x7a,
    //% block="7"
    Number_7 = 0x10,
    //% block="8"
    Number_8 = 0x38,
    //% block="9"
    Number_9 = 0x5a,
    //% block="*"
    Star = 0x42,
    //% block="0"
    Number_0 = 0x4a,
    //% block="#"
    Hash = 0x52,
}

const enum IR_ButtonAction {
    //% block="Pressed"
    Pressed = 0,
    //% block="Released"
    Released = 1,
}

const enum IrProtocol {
    //% block="Keyestudio"
    Keyestudio = 0,
    //% block="NEC"
    NEC = 1,
}


enum DigitalWritePin {
    //% block="P0"
    P0 = 0,
    //% block="P1"
    P1 = 1,
    //% block="P2"
    P2 = 2,
    //% block="P5"
    P5 = 5,
    //% block="P8"
    P8 = 8,
    //% block="P9"
    P9 = 9,
    //% block="P11"
    P11 = 11,
    //% block="P12"
    P12 = 12,
    //% block="P13(SCK)"
    P13 = 13,
    //% block="P14(MISO)"
    P14 = 14,
    //% block="P15(MOSI)"
    P15 = 15,
    //% block="P16"
    P16 = 16
}

enum DistanceUnit {
    //% block="cm"
    CM = 0,
    //% block="inch"
    INCH = 1
}

namespace background {

    export enum Thread {
        Priority = 0,
        UserCallback = 1,
    }

    export enum Mode {
        Repeat,
        Once,
    }

    class Executor {
        _newJobs: Job[] = undefined;
        _jobsToRemove: number[] = undefined;
        _pause: number = 100;
        _type: Thread;

        constructor(type: Thread) {
            this._type = type;
            this._newJobs = [];
            this._jobsToRemove = [];
            control.runInParallel(() => this.loop());
        }

        push(task: () => void, delay: number, mode: Mode): number {
            if (delay > 0 && delay < this._pause && mode === Mode.Repeat) {
                this._pause = Math.floor(delay);
            }
            const job = new Job(task, delay, mode);
            this._newJobs.push(job);
            return job.id;
        }

        cancel(jobId: number) {
            this._jobsToRemove.push(jobId);
        }

        loop(): void {
            const _jobs: Job[] = [];

            let previous = control.millis();

            while (true) {
                const now = control.millis();
                const delta = now - previous;
                previous = now;

                // Add new jobs
                this._newJobs.forEach(function (job: Job, index: number) {
                    _jobs.push(job);
                });
                this._newJobs = [];

                // Cancel jobs
                this._jobsToRemove.forEach(function (jobId: number, index: number) {
                    for (let i = _jobs.length - 1; i >= 0; i--) {
                        const job = _jobs[i];
                        if (job.id == jobId) {
                            _jobs.removeAt(i);
                            break;
                        }
                    }
                });
                this._jobsToRemove = []


                // Execute all jobs
                if (this._type === Thread.Priority) {
                    // newest first
                    for (let i = _jobs.length - 1; i >= 0; i--) {
                        if (_jobs[i].run(delta)) {
                            this._jobsToRemove.push(_jobs[i].id)
                        }
                    }
                } else {
                    // Execute in order of schedule
                    for (let i = 0; i < _jobs.length; i++) {
                        if (_jobs[i].run(delta)) {
                            this._jobsToRemove.push(_jobs[i].id)
                        }
                    }
                }

                basic.pause(this._pause);
            }
        }
    }

    class Job {
        id: number;
        func: () => void;
        delay: number;
        remaining: number;
        mode: Mode;

        constructor(func: () => void, delay: number, mode: Mode) {
            this.id = randint(0, 2147483647)
            this.func = func;
            this.delay = delay;
            this.remaining = delay;
            this.mode = mode;
        }

        run(delta: number): boolean {
            if (delta <= 0) {
                return false;
            }

            this.remaining -= delta;
            if (this.remaining > 0) {
                return false;
            }

            switch (this.mode) {
                case Mode.Once:
                    this.func();
                    basic.pause(0);
                    return true;
                case Mode.Repeat:
                    this.func();
                    this.remaining = this.delay;
                    basic.pause(0);
                    return false;
            }
        }
    }

    const queues: Executor[] = [];

    export function schedule(
        func: () => void,
        type: Thread,
        mode: Mode,
        delay: number,
    ): number {
        if (!func || delay < 0) return 0;

        if (!queues[type]) {
            queues[type] = new Executor(type);
        }

        return queues[type].push(func, delay, mode);
    }

    export function remove(type: Thread, jobId: number): void {
        if (queues[type]) {
            queues[type].cancel(jobId);
        }
    }
}


//% color="#6e5ba4" weight=20 icon="icon.png"
namespace TinkerBott {

    // IR Receiver @startTime
    let irState: IrState;

    const IR_REPEAT = 256;
    const IR_INCOMPLETE = 257;
    const IR_DATAGRAM = 258;

    const REPEAT_TIMEOUT_MS = 120;

    interface IrState {
        protocol: IrProtocol;
        hasNewDatagram: boolean;
        bitsReceived: uint8;
        addressSectionBits: uint16;
        commandSectionBits: uint16;
        hiword: uint16;
        loword: uint16;
        activeCommand: number;
        repeatTimeout: number;
        onIrButtonPressed: IrButtonHandler[];
        onIrButtonReleased: IrButtonHandler[];
        onIrDatagram: () => void;
    }
    class IrButtonHandler {
        irButton: IR_Button;
        onEvent: () => void;

        constructor(
            irButton: IR_Button,
            onEvent: () => void
        ) {
            this.irButton = irButton;
            this.onEvent = onEvent;
        }
    }


    function appendBitToDatagram(bit: number): number {
        irState.bitsReceived += 1;

        if (irState.bitsReceived <= 8) {
            irState.hiword = (irState.hiword << 1) + bit;
            if (irState.protocol === IrProtocol.Keyestudio && bit === 1) {
                // recover from missing message bits at the beginning
                // Keyestudio address is 0 and thus missing bits can be detected
                // by checking for the first inverse address bit (which is a 1)
                irState.bitsReceived = 9;
                irState.hiword = 1;
            }
        } else if (irState.bitsReceived <= 16) {
            irState.hiword = (irState.hiword << 1) + bit;
        } else if (irState.bitsReceived <= 32) {
            irState.loword = (irState.loword << 1) + bit;
        }

        if (irState.bitsReceived === 32) {
            irState.addressSectionBits = irState.hiword & 0xffff;
            irState.commandSectionBits = irState.loword & 0xffff;
            return IR_DATAGRAM;
        } else {
            return IR_INCOMPLETE;
        }
    }

    function decode(markAndSpace: number): number {
        if (markAndSpace < 1600) {
            // low bit
            return appendBitToDatagram(0);
        } else if (markAndSpace < 2700) {
            // high bit
            return appendBitToDatagram(1);
        }

        irState.bitsReceived = 0;

        if (markAndSpace < 12500) {
            // Repeat detected
            return IR_REPEAT;
        } else if (markAndSpace < 14500) {
            // Start detected
            return IR_INCOMPLETE;
        } else {
            return IR_INCOMPLETE;
        }
    }

    function enableIrMarkSpaceDetection(pin: DigitalPin) {
        pins.setPull(pin, PinPullMode.PullNone);

        let mark = 0;
        let space = 0;

        pins.onPulsed(pin, PulseValue.Low, () => {
            // HIGH
            mark = pins.pulseDuration();
        });

        pins.onPulsed(pin, PulseValue.High, () => {
            // LOW
            space = pins.pulseDuration();
            const status = decode(mark + space);

            if (status !== IR_INCOMPLETE) {
                handleIrEvent(status);
            }
        });
    }

    function handleIrEvent(irEvent: number) {

        // Refresh repeat timer
        if (irEvent === IR_DATAGRAM || irEvent === IR_REPEAT) {
            irState.repeatTimeout = input.runningTime() + REPEAT_TIMEOUT_MS;
        }

        if (irEvent === IR_DATAGRAM) {
            irState.hasNewDatagram = true;

            if (irState.onIrDatagram) {
                background.schedule(irState.onIrDatagram, background.Thread.UserCallback, background.Mode.Once, 0);
            }

            const newCommand = irState.commandSectionBits >> 8;

            // Process a new command
            if (newCommand !== irState.activeCommand) {

                if (irState.activeCommand >= 0) {
                    const releasedHandler = irState.onIrButtonReleased.find(h => h.irButton === irState.activeCommand || IR_Button.Any === h.irButton);
                    if (releasedHandler) {
                        background.schedule(releasedHandler.onEvent, background.Thread.UserCallback, background.Mode.Once, 0);
                    }
                }

                const pressedHandler = irState.onIrButtonPressed.find(h => h.irButton === newCommand || IR_Button.Any === h.irButton);
                if (pressedHandler) {
                    background.schedule(pressedHandler.onEvent, background.Thread.UserCallback, background.Mode.Once, 0);
                }

                irState.activeCommand = newCommand;
            }
        }
    }

    function initIrState() {
        if (irState) {
            return;
        }

        irState = {
            protocol: undefined,
            bitsReceived: 0,
            hasNewDatagram: false,
            addressSectionBits: 0,
            commandSectionBits: 0,
            hiword: 0, // TODO replace with uint32
            loword: 0,
            activeCommand: -1,
            repeatTimeout: 0,
            onIrButtonPressed: [],
            onIrButtonReleased: [],
            onIrDatagram: undefined,
        };
    }

    function notifyIrEvents() {
        if (irState.activeCommand === -1) {
            // skip to save CPU cylces
        } else {
            const now = input.runningTime();
            if (now > irState.repeatTimeout) {
                // repeat timed out

                const handler = irState.onIrButtonReleased.find(h => h.irButton === irState.activeCommand || IR_Button.Any === h.irButton);
                if (handler) {
                    background.schedule(handler.onEvent, background.Thread.UserCallback, background.Mode.Once, 0);
                }

                irState.bitsReceived = 0;
                irState.activeCommand = -1;
            }
        }
    }

    //% blockId=IR_onButton
    //% block="IR on button | %button | %action"
    //% button.fieldEditor="gridpicker"
    //% button.fieldOptions.columns=3
    //% button.fieldOptions.tooltips="false"
    //% group="IR Receiver"
    export function IR_onButton(
        button: IR_Button,
        action: IR_ButtonAction,
        handler: () => void
    ) {
        initIrState();
        if (action === IR_ButtonAction.Pressed) {
            irState.onIrButtonPressed.push(new IrButtonHandler(button, handler));
        }
        else {
            irState.onIrButtonReleased.push(new IrButtonHandler(button, handler));
        }
    }


    //% blockId=IR_DecodeResult
    //% block="IR button decode result is %button"
    //% button.fieldEditor="gridpicker"
    //% button.fieldOptions.columns=3
    //% button.fieldOptions.tooltips="false"
    //% group="IR Receiver"
    export function IR_isDecodeResult(button: IR_Button): boolean {
        let d = -1
        basic.pause(0); // Yield to support background processing when called in tight loops
        if (!irState) {
            d = IR_Button.Any
        } else {
            d = irState.commandSectionBits >> 8
        }
        return (d == button)
    }

    //% blockId=IR_isReceived
    //% block="IR data is received"
    //% group="IR Receiver"
    export function IR_isReceived(): boolean {
        basic.pause(0); // Yield to support background processing when called in tight loops
        initIrState();
        if (irState.hasNewDatagram) {
            irState.hasNewDatagram = false;
            return true;
        } else {
            return false;
        }
    }

    // /**
    //  * Returns the command code of a specific IR button.
    //  * @param button the button
    //  */
    // //% blockId=IR_ButtonCode
    // //% button.fieldEditor="gridpicker"
    // //% button.fieldOptions.columns=3
    // //% button.fieldOptions.tooltips="false"
    // //% block="IR button code %button"
    // //% group="IR Receiver"
    // export function IR_ButtonCode(button: IR_Button): number {
    //   basic.pause(0); // Yield to support background processing when called in tight loops
    //   return button as number;
    // }

    function ir_rec_to16BitHex(value: number): string {
        let hex = "";
        for (let pos = 0; pos < 4; pos++) {
            let remainder = value % 16;
            if (remainder < 10) {
                hex = remainder.toString() + hex;
            } else {
                hex = String.fromCharCode(55 + remainder) + hex;
            }
            value = Math.idiv(value, 16);
        }
        return hex;
    }

    //% blockId="IRReceiver_init"
    //% block="IR receiver at %pin"
    //% pin.fieldEditor="gridpicker"
    //% pin.fieldOptions.columns=4
    //% pin.fieldOptions.tooltips="false"
    //% group="IR Receiver"
    export function IRReceiver_init(pin: DigitalPin): void {
        initIrState();

        if (irState.protocol) {
            return;
        }

        irState.protocol = 1;

        enableIrMarkSpaceDetection(pin);

        background.schedule(notifyIrEvents, background.Thread.Priority, background.Mode.Repeat, REPEAT_TIMEOUT_MS);
    }
    // IR Receiver @end


    //% blockId=ledMatrixShowHex block="LED Matrix show Hex number %hex_num"
    //% group="LED Matrix"
    export function ledMatrixShowHex(hex_num: number): void {
        for (let i = 0; i < 25; i += 5) {
            for (let j = 0; j < 5; j++) {
                if ((hex_num >> (i + j)) & 1) {
                    led.plot(j, i / 5);
                }
                else {
                    led.unplot(j, i / 5);
                }
            }
        }
    }
    
    // 添加辅助函数
    function constrain(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    function getPort(pin_num: number): number {
        return 100 + pin_num
    }

    function getDigitalPin(pin_num: number): DigitalPin {
        return getPort(pin_num)
    }

    // Ultrasonic Sensor @start

    //% blockId="ultrasonic_distance"
    //% block="Ultrasonic Sensor with Echo|%echo|Trig|%trig|get distance in %unit"
    //% echo.defl=AnalogWritePin.P0
    //% trig.defl=DigitalWritePin.P1
    //% group="Ultrasonic Sensor"
    export function UltrasonicDistance(echo: DigitalPin, trig: DigitalWritePin, unit: DistanceUnit): number {
        let trigPin = getDigitalPin(trig)
        // send pulse
        pins.setPull(trigPin, PinPullMode.PullNone)
        pins.digitalWritePin(trigPin, 0)
        control.waitMicros(2)
        pins.digitalWritePin(trigPin, 1)
        control.waitMicros(10)
        pins.digitalWritePin(trigPin, 0)

        // read pulse
        let d = pins.pulseIn(echo, PulseValue.High)
        let distance = d / 58

        if (distance > 500) {
            distance = 500
        }

        switch (unit) {
            case 0:
                return Math.floor(distance)  //cm
                break
            case 1:
                return Math.floor(distance / 254)   //inch
                break
            default:
                return 500
        }
    }
    // Ultrasonic Sensor @end


    // Microbit Car  @start
    export enum RGBLights {
        //% blockId="Right_RGB" block="Right"
        RGB_R = 1,
        //% blockId="Left_RGB" block="Left"
        RGB_L = 2,
        //% blockId="ALL" block="ALL"
        ALL = 3
    }

    //% blockId=colorLight block="Set LED %light color $color"
    //% color.shadow="colorNumberPicker"
    //% weight=65
    //% group="Microbit Car"
    export function colorLight(light: RGBLights, color: number): void {
        let r: number, g: number, b: number;
        r = (color >> 16) & 0xFF; // 提取红色分量
        g = (color >> 8) & 0xFF;  // 提取绿色分量
        b = color & 0xFF;         // 提取蓝色分量
        singleheadlights(light, r, g, b); // 调用底层函数设置灯光颜色
    }


    //% inlineInputMode=inline
    //% blockId=singleheadlights block="Set %light lamp color R:%r G:%g B:%b"
    //% r.min=0 r.max=255
    //% g.min=0 g.max=255
    //% b.min=0 b.max=255
    //% weight=60
    //% group="Microbit Car"
    export function singleheadlights(light: RGBLights, r: number, g: number, b: number): void {
        let buf = pins.createBuffer(5);

        buf[0] = 0x00;
        buf[2] = r;
        buf[3] = g;
        buf[4] = b;

        if (light == 1) {
            buf[1] = 0x03;
            pins.i2cWriteBuffer(0x18, buf);
            basic.pause(10);
        }
        else if (light == 2) {
            buf[1] = 0x04;
            pins.i2cWriteBuffer(0x18, buf);
            basic.pause(10);
        }
        else if (light == 3) {
            buf[1] = 0x05;
            pins.i2cWriteBuffer(0x18, buf);
        }
    }

    export enum Direction {
        //% block="Forward" enumval=0
        forward,
        //% block="Backward" enumval=1
        backward,
        //% block="Left" enumval=2
        left,
        //% block="Right" enumval=3
        right
    }

    //% blockId=stopcar block="Stop"
    //% group="Microbit Car"
    //% weight=70
    export function stopcar(): void {
        let buf = pins.createBuffer(5);
        buf[0] = 0x00;                      //补位
        buf[1] = 0x01;		                //左轮
        buf[2] = 0x00;
        buf[3] = 0;	                        //速度	
        pins.i2cWriteBuffer(0x18, buf);     //数据发送

        buf[1] = 0x02;		                //右轮停止
        pins.i2cWriteBuffer(0x18, buf);     //数据发送
    }

    //% blockId=motors block="Left wheel speed %lspeed\\% | right speed %rspeed\\%"
    //% lspeed.min=-100 lspeed.max=100
    //% rspeed.min=-100 rspeed.max=100
    //% weight=100
    //% group="Microbit Car"
    export function motors(lspeed: number = 0, rspeed: number = 0): void {
        let buf = pins.createBuffer(4);

        // 限制速度范围
        lspeed = Math.constrain(lspeed, -100, 100);
        rspeed = Math.constrain(rspeed, -100, 100);

        // 左轮控制
        if (lspeed === 0) {
            // 单独停止左轮
            buf[0] = 0x00;
            buf[1] = 0x01;  // 左轮
            buf[2] = 0x00;  // 停止
            buf[3] = 0;     // 速度为0
            pins.i2cWriteBuffer(0x18, buf);
        }
        else if (lspeed > 0) {
            buf[0] = 0x00;
            buf[1] = 0x01;  // 左轮
            buf[2] = 0x02;  // 向前
            buf[3] = lspeed;
            pins.i2cWriteBuffer(0x18, buf);
        }
        else { // lspeed < 0
            buf[0] = 0x00;
            buf[1] = 0x01;  // 左轮
            buf[2] = 0x01;  // 向后
            buf[3] = -lspeed; // 取绝对值（~lspeed + 1 也可以，但 -lspeed 更直观）
            pins.i2cWriteBuffer(0x18, buf);
        }

        // 右轮控制
        if (rspeed === 0) {
            // 单独停止右轮
            buf[0] = 0x00;
            buf[1] = 0x02;  // 右轮
            buf[2] = 0x00;  // 停止
            buf[3] = 0;     // 速度为0
            pins.i2cWriteBuffer(0x18, buf);
        }
        else if (rspeed > 0) {
            buf[0] = 0x00;
            buf[1] = 0x02;  // 右轮
            buf[2] = 0x02;  // 向前
            buf[3] = rspeed;
            pins.i2cWriteBuffer(0x18, buf);
        }
        else { // rspeed < 0
            buf[0] = 0x00;
            buf[1] = 0x02;  // 右轮
            buf[2] = 0x01;  // 向后
            buf[3] = -rspeed; // 取绝对值
            pins.i2cWriteBuffer(0x18, buf);
        }
    }

    //% blockId=c block="Set direction %dir | speed %speed"
    //% weight=100
    //% speed.min=0 speed.max=100
    //% group="Microbit Car"
    export function moveTime(dir: Direction, speed: number = 50): void {

        let buf = pins.createBuffer(5);
        if (dir == 0) {
            buf[0] = 0x00;
            buf[1] = 0x01;
            buf[2] = 0x02;
            buf[3] = speed;
            pins.i2cWriteBuffer(0x18, buf);

            buf[1] = 0x02;
            pins.i2cWriteBuffer(0x18, buf);
        }
        if (dir == 1) {
            buf[0] = 0x00;
            buf[1] = 0x01;
            buf[2] = 0x01;
            buf[3] = speed;
            pins.i2cWriteBuffer(0x18, buf);

            buf[1] = 0x02;
            pins.i2cWriteBuffer(0x18, buf);
        }
        if (dir == 2) {
            buf[0] = 0x00;
            buf[1] = 0x01;
            buf[2] = 0x01;
            buf[3] = speed;
            pins.i2cWriteBuffer(0x18, buf);

            buf[1] = 0x02;
            buf[2] = 0x02;
            pins.i2cWriteBuffer(0x18, buf);
        }
        if (dir == 3) {
            buf[0] = 0x00;
            buf[1] = 0x01;
            buf[2] = 0x02;
            buf[3] = speed;
            pins.i2cWriteBuffer(0x18, buf);

            buf[1] = 0x02;
            buf[2] = 0x01;
            pins.i2cWriteBuffer(0x18, buf);

        }

    }

    export enum MbPins {
        //% block="Left" 
        Left = 0,
        //% block="Right" 
        Right = 1
    }

    //% blockId=tracking block="%pin tracking value"
    //% group="Microbit Car"
    //% weight=45
    export function tracking(side: MbPins): number {
        pins.setPull(AnalogPin.P0, PinPullMode.PullUp);
        pins.setPull(AnalogPin.P1, PinPullMode.PullUp);

        let left_tracking = pins.analogReadPin(AnalogPin.P1);
        let right_tracking = pins.analogReadPin(AnalogPin.P0);

        if (side == MbPins.Left) {
            return left_tracking;
        }
        else if (side == MbPins.Right) {
            return right_tracking;
        }
        else {
            return 0;
        }
    }

    // Microbit Car  @end


    // Microbit controller  @start

    export enum Rocker {
        //% block="X" enumval=0
        x,
        //% block="Y" enumval=1
        y,
        //% block="Key" enumval=2
        key,
    }


    //% blockId=joystick block="Read joystick value %dir "
    //% group="Microbit controller"
    export function joystick(dir: Rocker): number | boolean {
        switch (dir) {
            case Rocker.x:
                return pins.analogReadPin(AnalogPin.P1); // 读取摇杆 X 值
            case Rocker.y:
                return pins.analogReadPin(AnalogPin.P2); // 读取摇杆 Y 值
            case Rocker.key:
                pins.setPull(DigitalPin.P8, PinPullMode.PullUp); // 设置按键引脚为上拉模式
                return pins.digitalReadPin(DigitalPin.P8) === 0; // 读取按键状态，返回布尔值
            default:
                return false; // 如果传入无效的方向，返回 false
        }
    }

    export enum Four_key {
        //% block="Up" enumval=0
        up,
        //% block="Down" enumval=1
        down,
        //% block="Left" enumval=2
        left,
        //% block="Right" enumval=3
        right
    }

    //% blockId=Four_bit_key block="Read the %dir key"
    //% group="Microbit controller"
    export function Four_bit_key(dir: Four_key): boolean {
        // 设置引脚的上拉电阻
        pins.setPull(DigitalPin.P13, PinPullMode.PullUp)
        pins.setPull(DigitalPin.P14, PinPullMode.PullUp)
        pins.setPull(DigitalPin.P15, PinPullMode.PullUp)
        pins.setPull(DigitalPin.P16, PinPullMode.PullUp)

        // 根据方向读取对应的按键状态
        switch (dir) {
            case Four_key.up:
                return pins.digitalReadPin(DigitalPin.P16) === 0;
            case Four_key.down:
                return pins.digitalReadPin(DigitalPin.P14) === 0;
            case Four_key.left:
                return pins.digitalReadPin(DigitalPin.P13) === 0;
            case Four_key.right:
                return pins.digitalReadPin(DigitalPin.P15) === 0;
            default:
                return false; // 如果传入无效的方向，返回 false
        }
    }


    export enum Vibration_motor_condition {
        //% block="ON" enumval=0
        on,
        //% block="OFF" enumval=1
        off,
    }

    // 控制震动电机
    //% blockId=Vibrating_machine block="Vibrating machine %condition"
    //% group="Microbit controller"
    export function Vibrating_machine(condition: Vibration_motor_condition): void {
        if (condition === Vibration_motor_condition.on) {
            pins.digitalWritePin(DigitalPin.P12, 1); // 打开震动电机
        } else {
            pins.digitalWritePin(DigitalPin.P12, 0); // 关闭震动电机
        }
    }
    // Microbit controller  @end

}