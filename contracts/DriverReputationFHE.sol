// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract DriverReputationFHE is SepoliaConfig {

    struct EncryptedRating {
        uint256 id;
        euint32 encryptedScore;    // Encrypted rating score
        euint32 encryptedTags;     // Encrypted driver tags
        uint256 timestamp;
    }

    struct DecryptedRating {
        uint32 score;
        string tags;
        bool revealed;
    }

    uint256 public ratingCount;
    mapping(uint256 => EncryptedRating) public encryptedRatings;
    mapping(uint256 => DecryptedRating) public decryptedRatings;

    mapping(uint256 => euint32) private encryptedDriverScoreSum;
    mapping(uint256 => uint256) private driverRatingCount;
    mapping(uint256 => bytes32[]) private driverTagCloud;

    mapping(uint256 => uint256) private requestToRatingId;

    event RatingSubmitted(uint256 indexed id, uint256 timestamp);
    event DecryptionRequested(uint256 indexed id);
    event RatingDecrypted(uint256 indexed id);

    modifier onlyRater(uint256 ratingId) {
        _;
    }

    /// @notice Submit encrypted rating for a driver
    function submitEncryptedRating(
        euint32 encryptedScore,
        euint32 encryptedTags
    ) public {
        ratingCount += 1;
        uint256 newId = ratingCount;

        encryptedRatings[newId] = EncryptedRating({
            id: newId,
            encryptedScore: encryptedScore,
            encryptedTags: encryptedTags,
            timestamp: block.timestamp
        });

        decryptedRatings[newId] = DecryptedRating({
            score: 0,
            tags: "",
            revealed: false
        });

        emit RatingSubmitted(newId, block.timestamp);
    }

    /// @notice Request decryption for a rating
    function requestRatingDecryption(uint256 ratingId) public onlyRater(ratingId) {
        EncryptedRating storage r = encryptedRatings[ratingId];
        require(!decryptedRatings[ratingId].revealed, "Already revealed");

        bytes32 ;
        ciphertexts[0] = FHE.toBytes32(r.encryptedScore);
        ciphertexts[1] = FHE.toBytes32(r.encryptedTags);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptRating.selector);
        requestToRatingId[reqId] = ratingId;

        emit DecryptionRequested(ratingId);
    }

    /// @notice Callback after FHE decryption
    function decryptRating(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 ratingId = requestToRatingId[requestId];
        require(ratingId != 0, "Invalid request");

        FHE.checkSignatures(requestId, cleartexts, proof);

        string[] memory results = abi.decode(cleartexts, (string[]));
        uint32 score = uint32(bytesToUint(bytes(results[0])));
        string memory tags = results[1];

        decryptedRatings[ratingId].score = score;
        decryptedRatings[ratingId].tags = tags;
        decryptedRatings[ratingId].revealed = true;

        uint256 driverId = ratingId; // Simplification; normally map rating to driver
        encryptedDriverScoreSum[driverId] = FHE.add(
            encryptedDriverScoreSum[driverId],
            FHE.asEuint32(score)
        );
        driverRatingCount[driverId] += 1;
        driverTagCloud[driverId].push(keccak256(abi.encodePacked(tags)));

        emit RatingDecrypted(ratingId);
    }

    /// @notice Retrieve decrypted rating
    function getDecryptedRating(uint256 ratingId) public view returns (
        uint32 score,
        string memory tags,
        bool revealed
    ) {
        DecryptedRating storage r = decryptedRatings[ratingId];
        return (r.score, r.tags, r.revealed);
    }

    /// @notice Get FHE encrypted driver score sum
    function getEncryptedDriverScore(uint256 driverId) public view returns (euint32) {
        return encryptedDriverScoreSum[driverId];
    }

    /// @notice Request decryption of driver score
    function requestDriverScoreDecryption(uint256 driverId) public {
        euint32 sum = encryptedDriverScoreSum[driverId];
        require(FHE.isInitialized(sum), "Driver not found");

        bytes32 ;
        ciphertexts[0] = FHE.toBytes32(sum);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptDriverScore.selector);
        requestToRatingId[reqId] = driverId;
    }

    /// @notice Callback after driver score decryption
    function decryptDriverScore(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 driverId = requestToRatingId[requestId];
        FHE.checkSignatures(requestId, cleartexts, proof);
        uint32 decryptedSum = abi.decode(cleartexts, (uint32));
    }

    // Helper function
    function bytesToUint(bytes memory b) internal pure returns (uint256){
        uint256 number;
        for(uint i=0;i<b.length;i++){
            number = number + uint8(b[i])*(2**(8*(b.length-(i+1))));
        }
        return number;
    }
}
