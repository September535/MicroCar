/*
Shenzhen ACEBOTT Tech
modified from liusen
load dependency
"MicroCar": "file:../pxt-MicroCar"
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
namespace MicroCar {

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
        if (lspeed == 0) {
            // 单独停止左轮
            buf[0] = 0;
            buf[1] = 1;  // 左轮地址
            buf[2] = 0;  // 停止
            buf[3] = 0;  // 速度为0
            pins.i2cWriteBuffer(0x18, buf);
        }
        else if (lspeed > 0) {
            buf[0] = 0;
            buf[1] = 1;  // 左轮地址
            buf[2] = 1;  // 向前
            buf[3] = -lspeed;
            pins.i2cWriteBuffer(0x18, buf);
        }
        else { // lspeed < 0
            buf[0] = 0;
            buf[1] = 1;  // 左轮地址 - 这里原来是2，应该是1
            buf[2] = 2;  // 向后
            buf[3] = lspeed; // 取绝对值
            pins.i2cWriteBuffer(0x18, buf);
        }

        // 右轮控制
        if (rspeed == 0) {
            // 单独停止右轮
            buf[0] = 0;
            buf[1] = 2;  // 右轮地址
            buf[2] = 0;  // 停止
            buf[3] = 0;  // 速度为0
            pins.i2cWriteBuffer(0x18, buf);
        }
        else if (rspeed > 0) {
            buf[0] = 0;
            buf[1] = 2;  // 右轮地址
            buf[2] = 1;  // 向前
            buf[3] = -rspeed;
            pins.i2cWriteBuffer(0x18, buf);
        }
        else { // rspeed < 0
            buf[0] = 0;
            buf[1] = 2;  // 右轮地址
            buf[2] = 2;  // 向后
            buf[3] = rspeed; // 取绝对值
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

    // ==================== 枚举定义 ====================

    //LED light selection enumeration
    export enum MyEnumLed {
        //% block="Left"
        Left = 0,
        //% block="Right" 
        Right = 1,
        //% block="all"
        All = 2,
    }

    //LED light switch enumeration selection
    export enum MyEnumSwitch {
        //% block="close"
        Close = 0,
        //% block="open"
        Open = 1,
    };

    //Line sensor selection
    export enum MyEnumLineSensor {
        //% block="L1"
        SensorL1,
        //% block="L2"
        SensorL2,
        //% block="L3"
        SensorL3,
        //% block="L4"
        SensorL4,
        //% block="L5"
        SensorL5,
    };

    /**
     * Well known colors for a NeoPixel strip
     */
    export enum NeoPixelColors {
        //% block=red
        Red = 0xFF0000,
        //% block=orange
        Orange = 0xFFA500,
        //% block=yellow
        Yellow = 0xFFFF00,
        //% block=green
        Green = 0x00FF00,
        //% block=blue
        Blue = 0x0000FF,
        //% block=indigo
        Indigo = 0x4b0082,
        //% block=violet
        Violet = 0x8a2be2,
        //% block=purple
        Purple = 0xFF00FF,
        //% block=white
        White = 0xFFFFFF,
        //% block=black
        Black = 0x000000
    }
    const I2CADDR = 0x10;
    const ADC0_REGISTER = 0X1E;
    const ADC1_REGISTER = 0X20;
    const ADC2_REGISTER = 0X22;
    const ADC3_REGISTER = 0X24;
    const ADC4_REGISTER = 0X26;
    const LEFT_LED_REGISTER = 0X0B;
    const RIGHT_LED_REGISTER = 0X0C;
    const LEFT_MOTOR_REGISTER = 0X00;
    const RIGHT_MOTOR_REGISTER = 0X02;
    const LINE_STATE_REGISTER = 0X1D;
    const VERSION_CNT_REGISTER = 0X32;
    const VERSION_DATA_REGISTER = 0X33;

    let _brightness = 255

    let neopixel_buf = pins.createBuffer(16 * 3);
    for (let i = 0; i < 16 * 3; i++) {
        neopixel_buf[i] = 0
    }

    // ==================== 基础LED控制 ====================

    //% block="Set %eled LED%eSwitch"
    //% weight=97
    //% group="LED control"
    export function controlLED(eled: MyEnumLed, eSwitch: MyEnumSwitch): void {
        let buf = pins.createBuffer(4);
        buf[0] = 0;
        buf[1] = 6;
        buf[2] = eled;
        buf[3] = eSwitch;
        pins.i2cWriteBuffer(0x18, buf);
    }

    // ==================== RGB LED控制 ====================

    //% weight=2 blockGap=8
    //% blockId="neopixel_colors" block="%color"
    //% group="RGB LED"
    export function colors(color: NeoPixelColors): number {
        return color;
    }

    //% weight=60
    //% r.min=0 r.max=255
    //% g.min=0 g.max=255
    //% b.min=0 b.max=255
    //% block="R|%r G|%g B|%b"
    export function rgb(r: number, g: number, b: number): number {
        return (r << 16) + (g << 8) + (b);
    }

    //% weight=60
    //% from.min=1 from.max=4
    //% to.min=1 to.max=4
    //% block="range from |%from with|%to RGB"
    //% group="RGB LED"
    export function ledRange(from: number, to: number): number {
        // 确保from <= to
        let start = Math.min(from, to);
        let end = Math.max(from, to);

        return ((start) << 16) + (2 << 8) + (end);
    }

    //% weight=60
    //% index.min=0 index.max=4
    //% color.shadow="colorNumberPicker"
    //% block="SET LED |%index show color|%color"
    //% group="RGB LED"
    export function setIndexColor(index: number, color: number) {
        const pin = DigitalPin.P15;  // 使用默认引脚15

        // 初始化缓冲区
        if (!neopixel_buf) {
            neopixel_buf = pins.createBuffer(16 * 3);
        }

        let startIndex = 0;
        let endIndex = 0;

        // 根据index确定控制范围
        if (index <= 4) {
            // 处理单个灯或全部灯 (0-4)
            switch (index) {
                case 0: // 全部LED
                    startIndex = 0;
                    endIndex = 15;
                    break;
                case 1: // 第1个灯
                    startIndex = 0;
                    endIndex = 0;
                    break;
                case 2: // 第2个灯
                    startIndex = 1;
                    endIndex = 1;
                    break;
                case 3: // 第3个灯
                    startIndex = 2;
                    endIndex = 2;
                    break;
                case 4: // 第4个灯
                    startIndex = 3;
                    endIndex = 3;
                    break;
                default: // 理论上不会进入，保持为第一个灯
                    startIndex = 0;
                    endIndex = 0;
                    break;
            }
        } else {
            // 处理ledRange返回的编码值：格式为 ((from) << 16) + (2 << 8) + (to)
            // 提取起始和结束索引
            startIndex = (index >> 16) & 0xFFFF; // 获取高16位表示的起始灯
            endIndex = index & 0xFF;             // 获取低8位表示的结束灯
            // 可选：进行范围校验，确保索引在0-15之间
            startIndex = Math.max(0, Math.min(15, startIndex));
            endIndex = Math.max(0, Math.min(15, endIndex));
        }

        // 颜色提取 - 适配颜色选择器的返回值
        let r = (color >> 16) & 0xFF;
        let g = (color >> 8) & 0xFF;
        let b = color & 0xFF;

        // 应用亮度控制（如果需要）
        if (_brightness !== 255) {
            r = Math.round(r * (_brightness / 255));
            g = Math.round(g * (_brightness / 255));
            b = Math.round(b * (_brightness / 255));
        }

        // 填充指定范围的LED
        for (let i = startIndex; i <= endIndex; i++) {
            if (i < 16) {  // 确保不超出缓冲区范围
                neopixel_buf[i * 3 + 0] = g;  // G
                neopixel_buf[i * 3 + 1] = r;  // R  
                neopixel_buf[i * 3 + 2] = b;  // B
            }
        }

        // 发送数据到引脚15
        ws2812b.sendBuffer(neopixel_buf, pin);
    }

    //% weight=55
    //% block="Close RGB"
    //% group="RGB LED"
    export function Close_RGB() {
        const pin = DigitalPin.P15;

        // 初始化缓冲区
        if (!neopixel_buf) {
            neopixel_buf = pins.createBuffer(16 * 3);
        }

        // 设置所有LED为黑色（关闭）
        for (let i = 0; i < 16; i++) {
            neopixel_buf[i * 3 + 0] = 0;  // G = 0
            neopixel_buf[i * 3 + 1] = 0;  // R = 0
            neopixel_buf[i * 3 + 2] = 0;  // B = 0
        }

        // 发送数据
        ws2812b.sendBuffer(neopixel_buf, pin);
    }

    //% weight=70
    //% brightness.min=0 brightness.max=255
    //% block="set RGB luminance |%brightness"
    export function setBrightness(brightness: number) {
        _brightness = brightness;
    }


    // ==================== 巡线传感器 ====================

    //% block="getLineSensorAnalog %index state"
    //% weight=96
    //% group="Line inspection sensor"
    export function getLineSensorAnalog(index: MyEnumLineSensor): number {
        let buf = pins.createBuffer(4);
        buf[0] = 0;
        buf[1] = 7;

        switch (index) {
            case MyEnumLineSensor.SensorL1:
                buf[2] = 1;
                break;
            case MyEnumLineSensor.SensorL2:
                buf[2] = 2;
                break;
            case MyEnumLineSensor.SensorL3:
                buf[2] = 3;
                break;
            case MyEnumLineSensor.SensorL4:
                buf[2] = 4;
                break;
            case MyEnumLineSensor.SensorL5:
                buf[2] = 5;
                break;
            default:
                buf[2] = 0;
                break;
        }

        buf[3] = 0;
        pins.i2cWriteBuffer(0x18, buf);

        let rxbuf = pins.i2cReadBuffer(0x18, 5);

        let res = (rxbuf[3] | (rxbuf[4] << 7)) * 4;

        return res;
    }

    //% block="getLineSensorDigital %index ADC data"
    //% weight=95
    //% group="Line inspection sensor"
    export function getLineSensorDigital(index: MyEnumLineSensor): number {
        let buf = pins.createBuffer(4);
        buf[0] = 0;
        buf[1] = 8;

        switch (index) {
            case MyEnumLineSensor.SensorL1:
                buf[2] = 1;
                break;
            case MyEnumLineSensor.SensorL2:
                buf[2] = 2;
                break;
            case MyEnumLineSensor.SensorL3:
                buf[2] = 3;
                break;
            case MyEnumLineSensor.SensorL4:
                buf[2] = 4;
                break;
            case MyEnumLineSensor.SensorL5:
                buf[2] = 5;
                break;
            default:
                buf[2] = 0;
                break;
        }

        buf[3] = 0;
        pins.i2cWriteBuffer(0x18, buf);

        let rxbuf = pins.i2cReadBuffer(0x18, 4);

        let res = (rxbuf[3] | (rxbuf[4] << 7)) * 4;

        return res;
    }    // Microbit Car  @end

}