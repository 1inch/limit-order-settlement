const { expect, ether } = require("@1inch/solidity-utils");
const { addr0Wallet, addr1Wallet } = require("./helpers/utils");

const TokenMock = artifacts.require("TokenMock");
const WrappedTokenMock = artifacts.require("WrappedTokenMock");
const LimitOrderProtocol = artifacts.require("LimitOrderProtocol");
const WhitelistRegistrySimple = artifacts.require("WhitelistRegistrySimple");
const Settlement = artifacts.require("Settlement");

const { buildOrder, signOrder } = require("./helpers/orderUtils");

describe("WhitelistChecker", async () => {
    const [addr0, addr1] = [
        addr0Wallet.getAddressString(),
        addr1Wallet.getAddressString(),
    ];

    before(async () => {
        this.chainId = await web3.eth.getChainId();
        this.whitelistRegistrySimple = await WhitelistRegistrySimple.new();
    });

    beforeEach(async () => {
        this.dai = await TokenMock.new("DAI", "DAI");
        this.weth = await WrappedTokenMock.new("WETH", "WETH");

        this.swap = await LimitOrderProtocol.new(this.weth.address);

        await this.dai.mint(addr0, ether("100"));
        await this.dai.mint(addr1, ether("100"));
        await this.weth.deposit({ from: addr0, value: ether("1") });
        await this.weth.deposit({ from: addr1, value: ether("1") });

        await this.dai.approve(this.swap.address, ether("100"));
        await this.dai.approve(this.swap.address, ether("100"), {
            from: addr1,
        });
        await this.weth.approve(this.swap.address, ether("1"));
        await this.weth.approve(this.swap.address, ether("1"), { from: addr1 });

        this.matcher = await Settlement.new(
            this.whitelistRegistrySimple.address,
            this.swap.address
        );
    });

    const matchOrders = async (matchOrderMethod) => {
        const order0 = buildOrder({
            makerAsset: this.dai.address,
            takerAsset: this.weth.address,
            makingAmount: ether("100"),
            takingAmount: ether("0.1"),
            from: addr0,
        });
        const order1 = buildOrder({
            makerAsset: this.weth.address,
            takerAsset: this.dai.address,
            makingAmount: ether("0.1"),
            takingAmount: ether("100"),
            from: addr1,
        });
        const signature0 = signOrder(
            order0,
            this.chainId,
            this.swap.address,
            addr0Wallet.getPrivateKey()
        );
        const signature1 = signOrder(
            order1,
            this.chainId,
            this.swap.address,
            addr1Wallet.getPrivateKey()
        );
        const matchingParams =
            this.matcher.address +
            "01" +
            web3.eth.abi
                .encodeParameters(
                    ["address[]", "bytes[]"],
                    [
                        [this.weth.address, this.dai.address],
                        [
                            this.weth.contract.methods
                                .approve(this.swap.address, ether("0.1"))
                                .encodeABI(),
                            this.dai.contract.methods
                                .approve(this.swap.address, ether("100"))
                                .encodeABI(),
                        ],
                    ]
                )
                .substring(2);
        const interaction =
            this.matcher.address +
            "00" +
            this.swap.contract.methods
                .fillOrder(
                    order1,
                    signature1,
                    matchingParams,
                    ether("0.1"),
                    0,
                    ether("100")
                )
                .encodeABI()
                .substring(10);
        await matchOrderMethod(
            this.swap.address,
            order0,
            signature0,
            interaction,
            ether("100"),
            0,
            ether("0.1")
        );
    };

    describe("should not work with non-whitelisted address", async () => {
        it("onlyWhitelistedEOA modifier in matchOrdersEOA method", async () => {
            const order1 = buildOrder({
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: ether("10"),
                takingAmount: ether("0.01"),
                from: addr1,
            });
            await expect(
                this.matcher.matchOrdersEOA(
                    this.swap.address,
                    order1,
                    "0x",
                    "0x",
                    ether("10"),
                    0,
                    ether("0.01")
                )
            ).to.eventually.be.rejectedWith("AccessDenied()");
        });

        it("onlyWhitelisted modifier in matchOrders method", async () => {
            const order1 = buildOrder({
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: ether("10"),
                takingAmount: ether("0.01"),
                from: addr1,
            });
            await expect(
                this.matcher.matchOrders(
                    this.swap.address,
                    order1,
                    "0x",
                    "0x",
                    ether("10"),
                    0,
                    ether("0.01")
                )
            ).to.eventually.be.rejectedWith("AccessDenied()");
        });

        it("onlyWhitelisted modifier in fillOrderInteraction method", async () => {
            const order = buildOrder({
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: ether("100"),
                takingAmount: ether("0.1"),
                from: addr1,
            });
            const signature = signOrder(
                order,
                this.chainId,
                this.swap.address,
                addr1Wallet.getPrivateKey()
            );
            const interaction =
                this.matcher.address +
                "01" +
                web3.eth.abi
                    .encodeParameters(
                        ["address[]", "bytes[]"],
                        [[this.matcher.address], ["0x"]]
                    )
                    .substring(2);
            await expect(
                this.swap.fillOrder(
                    order,
                    signature,
                    interaction,
                    ether("10"),
                    0,
                    ether("0.01")
                )
            ).to.eventually.be.rejectedWith("AccessDenied()");
        });

        it("onlyLimitOrderProtocol modifier", async () => {
            await expect(
                this.matcher.fillOrderInteraction(addr0, "0", "0", "0x")
            ).to.eventually.be.rejectedWith("AccessDenied()");
        });
    });

    describe("should work with whitelisted address", async () => {
        beforeEach(async () => {
            await this.whitelistRegistrySimple.setStatus(addr0, true);
        });

        afterEach(async () => {
            await this.whitelistRegistrySimple.setStatus(addr0, false);
        });

        it("onlyWhitelistedEOA modifier in matchOrdersEOA method", async () => {
            const addr0weth = await this.weth.balanceOf(addr0);
            const addr1weth = await this.weth.balanceOf(addr1);
            const addr0dai = await this.dai.balanceOf(addr0);
            const addr1dai = await this.dai.balanceOf(addr1);

            await matchOrders(this.matcher.matchOrdersEOA);

            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(
                addr0weth.add(ether("0.1"))
            );
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(
                addr1weth.sub(ether("0.1"))
            );
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(
                addr0dai.sub(ether("100"))
            );
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(
                addr1dai.add(ether("100"))
            );
        });

        it("onlyWhitelisted modifier in matchOrders method", async () => {
            const addr0weth = await this.weth.balanceOf(addr0);
            const addr1weth = await this.weth.balanceOf(addr1);
            const addr0dai = await this.dai.balanceOf(addr0);
            const addr1dai = await this.dai.balanceOf(addr1);

            await matchOrders(this.matcher.matchOrders);

            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(
                addr0weth.add(ether("0.1"))
            );
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(
                addr1weth.sub(ether("0.1"))
            );
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(
                addr0dai.sub(ether("100"))
            );
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(
                addr1dai.add(ether("100"))
            );
        });
    });
});
