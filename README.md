# MicroCar

> 面向 ACEBOTT MicroCar V2.0 的 BBC micro:bit Microsoft MakeCode 扩展。

## 主要功能

- 左右电机速度与方向控制
- 前进、后退、左转和右转
- 红外遥控接收与按键事件
- 超声波测距
- RGB 灯颜色与亮度控制
- 巡线传感器数字量和模拟量读取

## 安装

1. 打开 [Microsoft MakeCode for micro:bit](https://makecode.microbit.org/)。
2. 新建项目并进入“扩展”。
3. 搜索以下仓库地址并导入：

```text
https://github.com/September535/MicroCar
```

## 快速开始

```typescript
MicroCar.motors(50, 50)
basic.pause(1000)
MicroCar.stopcar()
```

使用超声波、红外或巡线功能前，请确认传感器所连接的引脚与程序设置一致。

## 支持平台

- BBC micro:bit
- Microsoft MakeCode / PXT
- ACEBOTT MicroCar V2.0

## 开发

在 MakeCode 中依次选择“导入”→“导入 URL”，粘贴本仓库地址即可编辑扩展。

## 许可证

MIT
